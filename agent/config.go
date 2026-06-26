package main

import (
	"fmt"
	"os"
	"strconv"
)

// Environment variables read at startup.
const (
	envAuthKey     = "HEADTOWER_AGENT_AUTHKEY"      // required: tailnet pre-auth key
	envLoginServer = "HEADTOWER_AGENT_LOGIN_SERVER" // control plane URL (Headscale)
	envHostname    = "HEADTOWER_AGENT_HOSTNAME"     // node name presented to control
	envAddr        = "HEADTOWER_AGENT_ADDR"         // local HTTP listen address
	envStateDir    = "HEADTOWER_AGENT_STATE_DIR"    // tsnet state directory
	envEphemeral   = "HEADTOWER_AGENT_EPHEMERAL"    // register as an ephemeral node
	envVerbose     = "HEADTOWER_AGENT_VERBOSE"      // emit verbose tsnet backend logs
)

const (
	defaultHostname = "headtower-agent"
	defaultAddr     = ":8410"
)

// config holds the resolved runtime configuration.
type config struct {
	AuthKey    string // pre-auth key used to register the node
	ControlURL string // Headscale/Tailscale control URL; empty uses the default
	Hostname   string // node name presented to the control plane
	Addr       string // address the JSON API listens on
	StateDir   string // tsnet state dir; empty lets tsnet pick one
	Ephemeral  bool   // whether to register as an ephemeral node
	Verbose    bool   // whether to print verbose backend logs
}

// loadConfig reads configuration from the environment, applying defaults.
func loadConfig() (config, error) {
	cfg := config{
		AuthKey:    os.Getenv(envAuthKey),
		ControlURL: os.Getenv(envLoginServer),
		Hostname:   envOrDefault(envHostname, defaultHostname),
		Addr:       envOrDefault(envAddr, defaultAddr),
		StateDir:   os.Getenv(envStateDir),
		Ephemeral:  envBool(envEphemeral),
		Verbose:    envBool(envVerbose),
	}
	if cfg.AuthKey == "" {
		return config{}, fmt.Errorf("%s is required", envAuthKey)
	}
	return cfg, nil
}

// controlURLLabel returns a human-readable control plane label for logs.
func (c config) controlURLLabel() string {
	if c.ControlURL == "" {
		return "the default Tailscale control plane"
	}
	return c.ControlURL
}

func envOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func envBool(key string) bool {
	b, _ := strconv.ParseBool(os.Getenv(key))
	return b
}
