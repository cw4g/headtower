package main

import (
	"encoding/json"
	"log"
	"net/http"
	"time"
)

// newRouter wires the JSON HTTP API. Patterns use Go's method-aware ServeMux.
func newRouter(t *tailnet) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", handleHealthz)
	mux.HandleFunc("GET /peers", handlePeers(t))
	return logRequests(mux)
}

// handleHealthz is a cheap liveness probe; it does not touch the tailnet.
func handleHealthz(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"service": "headtower-agent",
		"status":  "ok",
		"time":    time.Now().UTC().Format(time.RFC3339),
	})
}

// handlePeers reports the tailnet peers visible to this node.
func handlePeers(t *tailnet) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		resp, err := t.Peers(r.Context())
		if err != nil {
			writeError(w, http.StatusBadGateway, "could not read tailnet status: "+err.Error())
			return
		}
		writeJSON(w, http.StatusOK, resp)
	}
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	if err := enc.Encode(body); err != nil {
		log.Printf("write response: %v", err)
	}
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// logRequests logs method, path, status, and duration for each request.
func logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		log.Printf("%s %s -> %d (%s)", r.Method, r.URL.Path, rec.status, time.Since(start).Round(time.Millisecond))
	})
}

// statusRecorder captures the response status code for logging.
type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}
