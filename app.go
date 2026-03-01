package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// AppVersion 客户端版本（构建时通过 ldflags 注入）
var AppVersion = "dev"

// App 桌面客户端主结构
type App struct {
	ctx     context.Context
	quickMu sync.Mutex
	quickCmd *exec.Cmd
	quickURL string
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// StatusInfo 隧道状态
type StatusInfo struct {
	Installed bool   `json:"installed"`
	Version   string `json:"version"`
	Output    string `json:"output"`
}

// RouteInfo 路由信息
type RouteInfo struct {
	Name     string `json:"name"`
	Hostname string `json:"hostname"`
	Service  string `json:"service"`
}

// QuickResult quick 模式结果
type QuickResult struct {
	URL string `json:"url"`
	Err string `json:"err"`
}

// cftunnelBin 缓存 cftunnel 可执行文件路径
var cftunnelBin string

// findCftunnel 查找 cftunnel 可执行文件路径
func findCftunnel() string {
	if cftunnelBin != "" {
		return cftunnelBin
	}
	// 优先 PATH 查找
	if p, err := exec.LookPath("cftunnel"); err == nil {
		cftunnelBin = p
		return p
	}
	// GUI 启动时 PATH 可能不完整，尝试常见路径
	home, _ := os.UserHomeDir()
	candidates := []string{
		home + "/bin/cftunnel",
		"/usr/local/bin/cftunnel",
		"/opt/homebrew/bin/cftunnel",
		home + "/.cftunnel/cftunnel",
	}
	for _, p := range candidates {
		if _, err := os.Stat(p); err == nil {
			cftunnelBin = p
			return p
		}
	}
	return "cftunnel"
}

// runCftunnel 执行 cftunnel 子命令（Windows 隐藏窗口）
func runCftunnel(args ...string) (string, error) {
	cmd := exec.Command(findCftunnel(), args...)
	hideWindow(cmd)
	out, err := cmd.CombinedOutput()
	return string(out), err
}

// CheckInstall 检查 cftunnel 是否已安装
func (a *App) CheckInstall() StatusInfo {
	out, err := runCftunnel("version")
	if err != nil {
		return StatusInfo{Installed: false}
	}
	return StatusInfo{
		Installed: true,
		Version:   strings.TrimSpace(out),
	}
}

// GetStatus 获取隧道状态
func (a *App) GetStatus() string {
	out, err := runCftunnel("status")
	if err != nil {
		return "未初始化"
	}
	return strings.TrimSpace(out)
}

// GetRoutes 获取路由列表
func (a *App) GetRoutes() []RouteInfo {
	out, err := runCftunnel("list")
	if err != nil {
		return nil
	}
	return parseRoutes(out)
}

// parseRoutes 解析 cftunnel list 输出
func parseRoutes(output string) []RouteInfo {
	lines := strings.Split(strings.TrimSpace(output), "\n")
	var routes []RouteInfo
	for i, line := range lines {
		if i == 0 {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) >= 3 {
			routes = append(routes, RouteInfo{
				Name:     fields[0],
				Hostname: fields[1],
				Service:  fields[2],
			})
		}
	}
	return routes
}

// StartQuick 启动免域名模式（后台运行，立即返回）
func (a *App) StartQuick(port string) QuickResult {
	a.quickMu.Lock()
	// 检查是否已在运行
	if a.quickCmd != nil && a.quickCmd.Process != nil {
		a.quickMu.Unlock()
		return QuickResult{Err: "隧道已在运行，请先停止"}
	}
	a.quickMu.Unlock()

	// 查找 cloudflared 路径
	binPath, err := exec.LookPath("cloudflared")
	if err != nil {
		home, _ := os.UserHomeDir()
		binPath = home + "/.cftunnel/cloudflared"
		if _, err := os.Stat(binPath); err != nil {
			return QuickResult{Err: "未找到 cloudflared，请先执行 cftunnel install"}
		}
	}

	// 显式指定空配置文件，防止 cloudflared 读取用户已有的 ~/.cloudflared/config.yml
	// 避免残留的 tunnel 字段触发 UUID 解析失败
	cfgPath := quickConfigPath()
	cmd := exec.Command(binPath, "tunnel", "--config", cfgPath, "--url", "http://localhost:"+port)
	hideWindow(cmd)

	stderr, err := cmd.StderrPipe()
	if err != nil {
		return QuickResult{Err: "创建管道失败: " + err.Error()}
	}

	if err := cmd.Start(); err != nil {
		return QuickResult{Err: "启动失败: " + err.Error()}
	}

	a.quickMu.Lock()
	a.quickCmd = cmd
	a.quickURL = ""
	a.quickMu.Unlock()

	// 保存 PID
	pidPath := quickPIDPath()
	home, _ := os.UserHomeDir()
	os.MkdirAll(home+"/.cftunnel", 0700)
	os.WriteFile(pidPath, []byte(strconv.Itoa(cmd.Process.Pid)), 0600)

	// 异步提取域名
	go a.scanQuickURL(stderr)

	// 异步等待进程退出，清理状态
	go func() {
		cmd.Wait()
		a.quickMu.Lock()
		a.quickCmd = nil
		a.quickURL = ""
		a.quickMu.Unlock()
		os.Remove(pidPath)
		os.Remove(quickURLPath())
	}()

	// 等待域名提取（最多 5 秒，前端会继续轮询）
	for i := 0; i < 10; i++ {
		time.Sleep(500 * time.Millisecond)
		a.quickMu.Lock()
		url := a.quickURL
		a.quickMu.Unlock()
		if url != "" {
			return QuickResult{URL: url}
		}
		a.quickMu.Lock()
		dead := a.quickCmd == nil
		a.quickMu.Unlock()
		if dead {
			return QuickResult{Err: "cloudflared 启动后异常退出"}
		}
	}

	return QuickResult{URL: ""}
}

// quickConfigPath 返回 quick 模式专用的空配置文件路径
func quickConfigPath() string {
	home, _ := os.UserHomeDir()
	dir := home + "/.cftunnel"
	p := dir + "/quick-config.yml"
	if _, err := os.Stat(p); os.IsNotExist(err) {
		os.MkdirAll(dir, 0700)
		os.WriteFile(p, []byte("# cftunnel quick mode - empty config\n"), 0600)
	}
	return p
}

// quickURLPath 返回 URL 持久化文件路径
func quickURLPath() string {
	home, _ := os.UserHomeDir()
	return home + "/.cftunnel/quick.url"
}

// quickPIDPath 返回免域名模式专用 PID 文件路径（与自有域名模式的 cloudflared.pid 隔离）
func quickPIDPath() string {
	home, _ := os.UserHomeDir()
	return home + "/.cftunnel/quick.pid"
}

// scanQuickURL 从 stderr 提取 trycloudflare.com 域名
func (a *App) scanQuickURL(r io.Reader) {
	scanner := bufio.NewScanner(r)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.Contains(line, "trycloudflare.com") {
			url := extractTunnelURL(line + "\n")
			if url != "" {
				a.quickMu.Lock()
				a.quickURL = url
				a.quickMu.Unlock()
				// 持久化到文件，app 重启后仍可读取
				os.WriteFile(quickURLPath(), []byte(url), 0600)
			}
		}
	}
}

// QuickStop 停止免域名模式
func (a *App) QuickStop() string {
	a.quickMu.Lock()
	cmd := a.quickCmd
	a.quickMu.Unlock()

	// 清理持久化文件
	os.Remove(quickURLPath())

	if cmd != nil && cmd.Process != nil {
		// app 内启动的进程，直接杀
		if err := quickProcessKill(cmd.Process.Pid); err != nil {
			return "停止失败: " + err.Error()
		}
		return "隧道已停止"
	}

	// 非 app 启动的，通过 quick.pid 文件杀进程
	pidData, err := os.ReadFile(quickPIDPath())
	if err != nil {
		return "未找到运行中的免域名隧道"
	}
	pid, err := strconv.Atoi(strings.TrimSpace(string(pidData)))
	if err != nil {
		return "PID 文件异常"
	}
	if err := quickProcessKill(pid); err != nil {
		return "停止失败: " + err.Error()
	}
	os.Remove(quickPIDPath())
	return "隧道已停止"
}

// QuickRunning 检查免域名模式是否在运行
func (a *App) QuickRunning() bool {
	a.quickMu.Lock()
	running := a.quickCmd != nil
	a.quickMu.Unlock()
	if running {
		return true
	}
	// 检查 quick 模式专用 PID 文件
	pidData, err := os.ReadFile(quickPIDPath())
	if err != nil {
		return false
	}
	pid, err := strconv.Atoi(strings.TrimSpace(string(pidData)))
	if err != nil {
		return false
	}
	return quickProcessAlive(pid)
}

// QuickURL 获取当前免域名模式的域名
func (a *App) QuickURL() string {
	a.quickMu.Lock()
	u := a.quickURL
	a.quickMu.Unlock()
	if u != "" {
		return u
	}
	// 兜底：从持久化文件读取（app 重启或 CLI 启动的场景）
	data, err := os.ReadFile(quickURLPath())
	if err == nil && len(data) > 0 {
		return strings.TrimSpace(string(data))
	}
	return ""
}

// TunnelUp 启动隧道
func (a *App) TunnelUp() string {
	out, err := runCftunnel("up")
	if err != nil {
		return fmt.Sprintf("错误: %s", out)
	}
	return strings.TrimSpace(out)
}

// TunnelDown 停止隧道
func (a *App) TunnelDown() string {
	out, err := runCftunnel("down")
	if err != nil {
		return fmt.Sprintf("错误: %s", out)
	}
	return strings.TrimSpace(out)
}

// RunCommand 通用命令执行（前端可调用任意 cftunnel 子命令）
func (a *App) RunCommand(args string) string {
	parts := strings.Fields(args)
	out, err := runCftunnel(parts...)
	if err != nil {
		return fmt.Sprintf("错误: %s\n%s", err, out)
	}
	return strings.TrimSpace(out)
}

// SelectDirectory 打开目录选择对话框
func (a *App) SelectDirectory() string {
	dir, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "选择目录",
	})
	if err != nil {
		return ""
	}
	return dir
}

func extractTunnelURL(output string) string {
	for _, line := range strings.Split(output, "\n") {
		if strings.Contains(line, "trycloudflare.com") {
			for _, word := range strings.Fields(line) {
				if strings.HasPrefix(word, "https://") {
					return word
				}
			}
		}
	}
	return ""
}

// DiagnoseResult 诊断结果（与 cftunnel diagnose --json 输出对应）
type DiagnoseResult struct {
	Cloudflared struct {
		Installed bool   `json:"installed"`
		Path      string `json:"path"`
		Version   string `json:"version"`
		Running   bool   `json:"running"`
		PID       int    `json:"pid"`
	} `json:"cloudflared"`
	API struct {
		Reachable bool   `json:"reachable"`
		LatencyMS int64  `json:"latency_ms"`
		Err       string `json:"err"`
	} `json:"api"`
	Routes []struct {
		Name     string `json:"name"`
		Hostname string `json:"hostname"`
		Service  string `json:"service"`
		LocalOK  bool   `json:"local_ok"`
		LocalErr string `json:"local_err"`
		DNSOK    bool   `json:"dns_ok"`
		DNSErr   string `json:"dns_err"`
		HTTPOK   bool   `json:"http_ok"`
		HTTPErr  string `json:"http_err"`
	} `json:"routes"`
	Total  int `json:"total"`
	Passed int `json:"passed"`
	Failed int `json:"failed"`
}

// Diagnose 执行 Cloud 模式链路诊断
func (a *App) Diagnose() DiagnoseResult {
	var result DiagnoseResult
	out, err := runCftunnel("diagnose", "--json")
	if err != nil {
		return result
	}
	json.Unmarshal([]byte(out), &result)
	return result
}

// ==================== Relay 模式 ====================

// RelayRuleInfo 中继规则
type RelayRuleInfo struct {
	Name       string `json:"name"`
	Proto      string `json:"proto"`
	LocalPort  int    `json:"local_port"`
	RemotePort int    `json:"remote_port"`
	Domain     string `json:"domain"`
}

// RelayStatusInfo 中继状态
type RelayStatusInfo struct {
	Server  string `json:"server"`
	Running bool   `json:"running"`
	PID     string `json:"pid"`
	Rules   int    `json:"rules"`
}

// GetRelayStatus 获取中继状态
func (a *App) GetRelayStatus() RelayStatusInfo {
	out, err := runCftunnel("relay", "status")
	if err != nil {
		return RelayStatusInfo{}
	}
	return parseRelayStatus(out)
}

// GetRelayRules 获取中继规则列表
func (a *App) GetRelayRules() []RelayRuleInfo {
	out, err := runCftunnel("relay", "list")
	if err != nil {
		return nil
	}
	return parseRelayRules(out)
}

// RelayUp 启动中继
func (a *App) RelayUp() string {
	out, err := runCftunnel("relay", "up")
	if err != nil {
		return fmt.Sprintf("错误: %s", out)
	}
	return strings.TrimSpace(out)
}

// RelayDown 停止中继
func (a *App) RelayDown() string {
	out, err := runCftunnel("relay", "down")
	if err != nil {
		return fmt.Sprintf("错误: %s", out)
	}
	return strings.TrimSpace(out)
}

// RelayAddRule 添加中继规则
func (a *App) RelayAddRule(name, proto string, localPort, remotePort int, domain string) string {
	args := []string{"relay", "add", name, "--proto", proto, "--local", fmt.Sprintf("%d", localPort)}
	if remotePort > 0 {
		args = append(args, "--remote", fmt.Sprintf("%d", remotePort))
	}
	if domain != "" {
		args = append(args, "--domain", domain)
	}
	out, err := runCftunnel(args...)
	if err != nil {
		return fmt.Sprintf("错误: %s\n%s", err, out)
	}
	return strings.TrimSpace(out)
}

// RelayRemoveRule 删除中继规则
func (a *App) RelayRemoveRule(name string) string {
	out, err := runCftunnel("relay", "remove", name)
	if err != nil {
		return fmt.Sprintf("错误: %s\n%s", err, out)
	}
	return strings.TrimSpace(out)
}

// RelayInit 初始化中继配置
func (a *App) RelayInit(server, token string) string {
	out, err := runCftunnel("relay", "init", "--server", server, "--token", token)
	if err != nil {
		return fmt.Sprintf("错误: %s\n%s", err, out)
	}
	return strings.TrimSpace(out)
}

// RelayInstallService 注册中继系统服务
func (a *App) RelayInstallService() string {
	out, err := runCftunnel("relay", "install")
	if err != nil {
		return fmt.Sprintf("错误: %s\n%s", err, out)
	}
	return strings.TrimSpace(out)
}

// RelayUninstallService 卸载中继系统服务
func (a *App) RelayUninstallService() string {
	out, err := runCftunnel("relay", "uninstall")
	if err != nil {
		return fmt.Sprintf("错误: %s\n%s", err, out)
	}
	return strings.TrimSpace(out)
}

// GetRelayLogs 获取中继日志（最后 100 行）
func (a *App) GetRelayLogs() string {
	out, err := runCftunnel("relay", "logs")
	if err != nil {
		return fmt.Sprintf("暂无日志\n%s", strings.TrimSpace(out))
	}
	return strings.TrimSpace(out)
}

// RelayServerSetup 远程部署 frps 服务端（支持密钥或密码认证）
func (a *App) RelayServerSetup(host string, port int, user, keyPath, password string, frpsPort int) string {
	args := []string{"relay", "server", "setup", "--host", host, "-p", fmt.Sprintf("%d", port), "--user", user, "--frps-port", fmt.Sprintf("%d", frpsPort)}
	if password != "" {
		args = append(args, "--pass", password)
	} else if keyPath != "" {
		args = append(args, "--key", keyPath)
	}
	out, err := runCftunnel(args...)
	if err != nil {
		return fmt.Sprintf("错误: %s\n%s", err, out)
	}
	return strings.TrimSpace(out)
}

// CheckResultInfo 链路检测结果
type CheckResultInfo struct {
	Server        string          `json:"server"`
	ServerOK      bool            `json:"server_ok"`
	ServerLatency int64           `json:"server_latency_ms"`
	FrpcRunning   bool            `json:"frpc_running"`
	FrpcPID       int             `json:"frpc_pid"`
	Rules         []RuleCheckInfo `json:"rules"`
	Total         int             `json:"total"`
	Passed        int             `json:"passed"`
	Failed        int             `json:"failed"`
}

// RuleCheckInfo 单条规则检测结果
type RuleCheckInfo struct {
	Name       string `json:"name"`
	Proto      string `json:"proto"`
	LocalPort  int    `json:"local_port"`
	RemotePort int    `json:"remote_port"`
	LocalOK    bool   `json:"local_ok"`
	RemoteOK   bool   `json:"remote_ok"`
	LatencyMS  int64  `json:"latency_ms"`
	LocalErr   string `json:"local_err"`
	RemoteErr  string `json:"remote_err"`
}

// RelayCheck 执行链路检测
func (a *App) RelayCheck() CheckResultInfo {
	out, err := runCftunnel("relay", "check", "--json")
	if err != nil {
		return CheckResultInfo{}
	}
	var result CheckResultInfo
	if json.Unmarshal([]byte(out), &result) != nil {
		return CheckResultInfo{}
	}
	return result
}

// parseRelayStatus 解析 relay status 输出
func parseRelayStatus(output string) RelayStatusInfo {
	info := RelayStatusInfo{}
	for _, line := range strings.Split(output, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "服务器:") || strings.HasPrefix(line, "服务器：") {
			info.Server = strings.TrimSpace(strings.SplitN(line, ":", 2)[1])
			if strings.Contains(line, "：") {
				info.Server = strings.TrimSpace(strings.SplitN(line, "：", 2)[1])
			}
		} else if strings.HasPrefix(line, "状态:") || strings.HasPrefix(line, "状态：") {
			if strings.Contains(line, "运行中") {
				info.Running = true
				// 提取 PID
				if idx := strings.Index(line, "PID:"); idx >= 0 {
					pid := strings.TrimSpace(line[idx+4:])
					pid = strings.TrimRight(pid, ")")
					info.PID = pid
				}
			}
		} else if strings.HasPrefix(line, "规则数:") || strings.HasPrefix(line, "规则数：") {
			fmt.Sscanf(line, "规则数: %d", &info.Rules)
			if info.Rules == 0 {
				fmt.Sscanf(line, "规则数：%d", &info.Rules)
			}
		}
	}
	return info
}

// parseRelayRules 解析 relay list 输出
func parseRelayRules(output string) []RelayRuleInfo {
	lines := strings.Split(strings.TrimSpace(output), "\n")
	if len(lines) == 0 || strings.Contains(output, "暂无中继规则") {
		return nil
	}
	var rules []RelayRuleInfo
	for i, line := range lines {
		// 跳过表头和分隔线
		if i < 2 {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 4 {
			continue
		}
		var localPort, remotePort int
		fmt.Sscanf(fields[2], "%d", &localPort)
		if fields[3] != "-" {
			fmt.Sscanf(fields[3], "%d", &remotePort)
		}
		domain := ""
		if len(fields) >= 5 && fields[4] != "-" {
			domain = fields[4]
		}
		rules = append(rules, RelayRuleInfo{
			Name:       fields[0],
			Proto:      fields[1],
			LocalPort:  localPort,
			RemotePort: remotePort,
			Domain:     domain,
		})
	}
	return rules
}

// UpdateInfo 更新检测结果
type UpdateInfo struct {
	CurrentVersion string `json:"current_version"`
	LatestVersion  string `json:"latest_version"`
	HasUpdate      bool   `json:"has_update"`
	ReleaseURL     string `json:"release_url"`
	Err            string `json:"err,omitempty"`
}

// GetAppVersion 获取客户端版本
func (a *App) GetAppVersion() string {
	return AppVersion
}

// CheckAppUpdate 检查客户端更新
func (a *App) CheckAppUpdate() UpdateInfo {
	info := UpdateInfo{CurrentVersion: AppVersion}
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get("https://api.github.com/repos/qingchencloud/cftunnel-app/releases/latest")
	if err != nil {
		info.Err = "网络请求失败"
		return info
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		info.Err = "读取响应失败"
		return info
	}
	var release struct {
		TagName string `json:"tag_name"`
		HTMLURL string `json:"html_url"`
	}
	if json.Unmarshal(body, &release) != nil {
		info.Err = "解析响应失败"
		return info
	}
	info.LatestVersion = strings.TrimPrefix(release.TagName, "v")
	info.ReleaseURL = release.HTMLURL
	info.HasUpdate = info.LatestVersion != "" && info.LatestVersion != strings.TrimPrefix(AppVersion, "v")
	return info
}
