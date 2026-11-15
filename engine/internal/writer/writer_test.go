package writer

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"sync"
	"testing"
	"time"
)

type recorder struct {
	mu      sync.Mutex
	batches [][]Item
	failN   int
}

func (r *recorder) flush(_ context.Context, b []Item) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.failN > 0 {
		r.failN--
		return errors.New("db down")
	}
	r.batches = append(r.batches, append([]Item(nil), b...))
	return nil
}

func (r *recorder) total() (n int, batches int) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, b := range r.batches {
		n += len(b)
	}
	return n, len(r.batches)
}

var quiet = slog.New(slog.NewTextHandler(io.Discard, nil))

func TestFlushBySize(t *testing.T) {
	r := &recorder{}
	w := New(Config{BufferSize: 100, BatchSize: 10, FlushInterval: time.Hour, RetryMax: time.Second}, r.flush, quiet)
	go w.Run(context.Background())
	for i := 0; i < 25; i++ {
		w.Enqueue(Item{WaMsgID: "x"})
	}
	w.Close() // sisa 5 harus di-flush saat close
	n, b := r.total()
	if n != 25 || b != 3 {
		t.Fatalf("got %d items in %d batches", n, b)
	}
}

func TestFlushByInterval(t *testing.T) {
	r := &recorder{}
	w := New(Config{BufferSize: 100, BatchSize: 1000, FlushInterval: 20 * time.Millisecond, RetryMax: time.Second}, r.flush, quiet)
	go w.Run(context.Background())
	w.Enqueue(Item{WaMsgID: "a"})
	w.Enqueue(Item{WaMsgID: "b"})
	time.Sleep(100 * time.Millisecond)
	if n, _ := r.total(); n != 2 {
		t.Fatalf("expected interval flush, got %d", n)
	}
	w.Close()
}

func TestRetryOnError(t *testing.T) {
	r := &recorder{failN: 2}
	w := New(Config{BufferSize: 10, BatchSize: 1, FlushInterval: time.Hour, RetryMax: 10 * time.Millisecond}, r.flush, quiet)
	go w.Run(context.Background())
	w.Enqueue(Item{WaMsgID: "a"})
	w.Close()
	if n, _ := r.total(); n != 1 {
		t.Fatalf("item lost after retry, got %d", n)
	}
}
