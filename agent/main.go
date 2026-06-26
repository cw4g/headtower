// Command headtower-agent is a small tailnet sidecar for Headtower.
//
// It joins a Headscale/Tailscale tailnet as a userspace node (via tsnet) and
// exposes a tiny JSON HTTP API describing the peers it can see. This surfaces
// per-device metadata - client version, OS, endpoints, last-seen - that the
// Headscale admin API does not return, so the Headtower console can show a
// richer, more honest picture of the mesh.
//
// It is original work and shares no code with any other project.
package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"
)

func main() {
	log.SetFlags(log.LstdFlags | log.LUTC)
	log.SetPrefix("headtower-agent: ")
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

func run() error {
	cfg, err := loadConfig()
	if err != nil {
		return err
	}

	// Root context is cancelled on the first interrupt/terminate signal.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	tn := newTailnet(cfg)
	defer tn.Close()

	log.Printf("joining tailnet as %q via %s", cfg.Hostname, cfg.controlURLLabel())
	if err := tn.Start(ctx); err != nil {
		return fmt.Errorf("joining tailnet: %w", err)
	}
	log.Printf("tailnet up; addresses: %s", strings.Join(tn.Addresses(), ", "))

	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           newRouter(tn),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	serveErr := make(chan error, 1)
	go func() {
		log.Printf("serving JSON API on %s", cfg.Addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serveErr <- err
			return
		}
		serveErr <- nil
	}()

	// Block until we are told to stop or the server falls over.
	select {
	case <-ctx.Done():
		log.Print("shutdown signal received; draining")
	case err := <-serveErr:
		if err != nil {
			return fmt.Errorf("http server: %w", err)
		}
		return nil
	}

	// Give in-flight requests a moment, then close the tailnet (via defer).
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("http shutdown: %w", err)
	}
	log.Print("stopped cleanly")
	return nil
}
