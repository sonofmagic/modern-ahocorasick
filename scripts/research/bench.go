package main

import (
	"encoding/json"
	ac "github.com/BobuSumisu/aho-corasick"
	"os"
	"runtime"
	"strings"
	"time"
)

func main() {
	p, _ := os.ReadFile(os.Args[1])
	patterns := strings.Split(strings.TrimSuffix(string(p), "\n"), "\n")
	text, _ := os.ReadFile(os.Args[2])
	runtime.GC()
	var before, after runtime.MemStats
	runtime.ReadMemStats(&before)
	t := time.Now()
	trie := ac.NewTrieBuilder().AddStrings(patterns).Build()
	build := float64(time.Since(t).Nanoseconds()) / 1e6
	runtime.GC()
	runtime.ReadMemStats(&after)
	scan := func() (uint64, uint64) {
		var n, s uint64
		trie.Walk(text, func(end, length, id uint32) bool {
			n++
			s += uint64(end-length+1) + uint64(end+1) + uint64(id)
			return true
		})
		return n, s
	}
	for i := 0; i < 20; i++ {
		scan()
		trie.Walk(text, func(_, _, _ uint32) bool { return false })
	}
	t = time.Now()
	n, s := scan()
	query := float64(time.Since(t).Nanoseconds()) / 1e6
	t = time.Now()
	trie.Walk(text, func(_, _, _ uint32) bool { return false })
	first := float64(time.Since(t).Nanoseconds()) / 1e6
	json.NewEncoder(os.Stdout).Encode(map[string]any{"buildMs": build, "queryMs": query, "firstMs": first, "count": n, "checksum": s, "retainedHeapBytes": int64(after.HeapAlloc) - int64(before.HeapAlloc)})
	runtime.KeepAlive(trie)
}
