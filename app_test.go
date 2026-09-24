package main

import (
	"net"
	"testing"
)

func TestStartQuickRejectsInvalidPortBeforeDownload(t *testing.T) {
	a := NewApp()
	for _, port := range []string{"", "0", "65536", "abc", "3000;echo"} {
		if result := a.StartQuick(port); result.Err == "" {
			t.Errorf("StartQuick(%q) should reject invalid port", port)
		}
	}
}

func TestDetectLocalServicesReturnsKnownPort(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:3001")
	if err != nil {
		t.Skipf("port 3001 already in use: %v", err)
	}
	defer listener.Close()
	services := NewApp().DetectLocalServices()
	for _, service := range services {
		if service.Port == 3001 {
			if service.URL != "http://localhost:3001" {
				t.Fatalf("URL = %q", service.URL)
			}
			return
		}
	}
	t.Fatal("expected to detect port 3001")
}

func TestExtractTunnelURL(t *testing.T) {
	tests := []struct {
		name   string
		input  string
		expect string
	}{
		{"正常输出", "INF +---\nINF | https://foo-bar-baz.trycloudflare.com\nINF +---", "https://foo-bar-baz.trycloudflare.com"},
		{"无 URL", "some random output\nno url here", ""},
		{"空输入", "", ""},
		{"多行含 URL", "line1\n2024 INFO https://abc-def.trycloudflare.com ready\nline3", "https://abc-def.trycloudflare.com"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := extractTunnelURL(tt.input)
			if got != tt.expect {
				t.Errorf("extractTunnelURL() = %q, want %q", got, tt.expect)
			}
		})
	}
}

func TestParseRoutes(t *testing.T) {
	tests := []struct {
		name   string
		input  string
		expect int
	}{
		{"正常输出", "名称           域名                           服务\nwebhook      webhook.qrj.ai                 http://localhost:9801\nopenclaw     openclaw.qrj.ai                http://localhost:18789", 2},
		{"仅表头", "名称           域名                           服务", 0},
		{"空输出", "", 0},
		{"暂无路由", "暂无路由", 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			routes := parseRoutes(tt.input)
			if len(routes) != tt.expect {
				t.Errorf("parseRoutes() got %d routes, want %d", len(routes), tt.expect)
			}
		})
	}
}

func TestParseRoutesFields(t *testing.T) {
	input := "名称           域名                           服务\nmyapp        app.example.com                http://localhost:3000"
	routes := parseRoutes(input)
	if len(routes) != 1 {
		t.Fatalf("expected 1 route, got %d", len(routes))
	}
	r := routes[0]
	if r.Name != "myapp" {
		t.Errorf("Name = %q, want %q", r.Name, "myapp")
	}
	if r.Hostname != "app.example.com" {
		t.Errorf("Hostname = %q, want %q", r.Hostname, "app.example.com")
	}
	if r.Service != "http://localhost:3000" {
		t.Errorf("Service = %q, want %q", r.Service, "http://localhost:3000")
	}
}

// ==================== Relay 解析测试 ====================

func TestParseRelayStatus(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		running bool
		server  string
		rules   int
	}{
		{"运行中", "服务器: 1.2.3.4:7000\n状态:   运行中 (PID: 12345)\n规则数: 3", true, "1.2.3.4:7000", 3},
		{"未运行", "服务器: 1.2.3.4:7000\n状态:   未运行\n规则数: 0", false, "1.2.3.4:7000", 0},
		{"空输出", "", false, "", 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			info := parseRelayStatus(tt.input)
			if info.Running != tt.running {
				t.Errorf("Running = %v, want %v", info.Running, tt.running)
			}
			if info.Server != tt.server {
				t.Errorf("Server = %q, want %q", info.Server, tt.server)
			}
			if info.Rules != tt.rules {
				t.Errorf("Rules = %d, want %d", info.Rules, tt.rules)
			}
		})
	}
}

func TestParseRelayRules(t *testing.T) {
	tests := []struct {
		name   string
		input  string
		expect int
	}{
		{"正常表格", "名称\t协议\t本地端口\t远程端口\t域名\n----\t----\t--------\t--------\t----\nmc\ttcp\t25565\t25565\t-\nssh\ttcp\t22\t6022\t-", 2},
		{"空规则", "暂无中继规则", 0},
		{"单条规则", "名称\t协议\t本地端口\t远程端口\t域名\n----\t----\t--------\t--------\t----\nweb\thttp\t3000\t-\texample.com", 1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rules := parseRelayRules(tt.input)
			if len(rules) != tt.expect {
				t.Errorf("parseRelayRules() got %d rules, want %d", len(rules), tt.expect)
			}
		})
	}
}

func TestParseRelayRulesFields(t *testing.T) {
	input := "名称\t协议\t本地端口\t远程端口\t域名\n----\t----\t--------\t--------\t----\nmc\ttcp\t25565\t25565\t-"
	rules := parseRelayRules(input)
	if len(rules) != 1 {
		t.Fatalf("expected 1 rule, got %d", len(rules))
	}
	r := rules[0]
	if r.Name != "mc" {
		t.Errorf("Name = %q, want %q", r.Name, "mc")
	}
	if r.Proto != "tcp" {
		t.Errorf("Proto = %q, want %q", r.Proto, "tcp")
	}
	if r.LocalPort != 25565 {
		t.Errorf("LocalPort = %d, want %d", r.LocalPort, 25565)
	}
	if r.RemotePort != 25565 {
		t.Errorf("RemotePort = %d, want %d", r.RemotePort, 25565)
	}
}

func TestUpdateVersionComparison(t *testing.T) {
	tests := []struct {
		latest, current string
		want            bool
	}{
		{"0.4.3", "0.4.2", true},
		{"0.4.2", "0.4.2", false},
		{"v1.0.0", "0.9.9", true},
		{"0.4.1", "0.4.2", false},
		{"0.4.3", "未安装", false},
	}
	for _, tt := range tests {
		if got := isNewerVersion(tt.latest, tt.current); got != tt.want {
			t.Errorf("isNewerVersion(%q, %q) = %v, want %v", tt.latest, tt.current, got, tt.want)
		}
	}
}

func TestParseVersion(t *testing.T) {
	if got := parseVersion("cftunnel v0.4.2\n"); got != "0.4.2" {
		t.Fatalf("parseVersion() = %q", got)
	}
}
