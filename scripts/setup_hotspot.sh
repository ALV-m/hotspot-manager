#!/bin/bash
# =============================================================================
#  FastNet Hotspot — Kali Linux
#  Internet source : WiFi (wlan0) — untouched, stays NM-managed
#  Hotspot output  : Ethernet (eth0) — clients connect via AP/switch
#  Runs in FOREGROUND — Ctrl+C to stop cleanly
# =============================================================================
# Usage: sudo bash setup_hotspot.sh
# =============================================================================

# ─────────────────────────────────────────────────────────────
# CONFIGURATION — edit before running
# ─────────────────────────────────────────────────────────────
PORTAL_URL="https://YOUR-APP.replit.app"   # Your deployed Replit portal URL
INET_IFACE="wlan0"                         # Internet source (WiFi to router)
AP_IFACE="eth0"                            # Output interface (to AP/switch)
AP_SUBNET="192.168.10"
KALI_IP="${AP_SUBNET}.1"
REDIRECT_PORT="8080"
DHCP_START="${AP_SUBNET}.10"
DHCP_END="${AP_SUBNET}.100"
LEASES_FILE="/tmp/fastnet_dnsmasq.leases"
DNSMASQ_PID="/tmp/fastnet_dnsmasq.pid"
REFRESH_SECS=5
# ─────────────────────────────────────────────────────────────

R='\033[0;31m'; G='\033[0;32m'; Y='\033[1;33m'
B='\033[0;34m'; C='\033[0;36m'; W='\033[1;37m'
DIM='\033[2m'; BOLD='\033[1m'; NC='\033[0m'

info()  { echo -e "${B}[INFO]${NC} $1"; }
ok()    { echo -e "${G}[ OK ]${NC} $1"; }
warn()  { echo -e "${Y}[WARN]${NC} $1"; }
err()   { echo -e "${R}[ERR ]${NC} $1"; }
die()   { err "$1"; cleanup; exit 1; }

PIDS_TO_KILL=()

cleanup() {
  echo ""
  echo -e "${Y}Stopping FastNet...${NC}"
  for pid in "${PIDS_TO_KILL[@]}"; do kill "$pid" 2>/dev/null || true; done
  [[ -f "$DNSMASQ_PID" ]] && kill "$(cat $DNSMASQ_PID)" 2>/dev/null || true
  pkill -f "fastnet_redirect_inline" 2>/dev/null || true
  pkill -f "fastnet_unblock_inline"  2>/dev/null || true

  iptables -t nat -F 2>/dev/null || true
  iptables -F CAPTIVE_WHITELIST 2>/dev/null || true
  iptables -D FORWARD -i "$AP_IFACE" -j CAPTIVE_WHITELIST 2>/dev/null || true
  iptables -D FORWARD -i "$AP_IFACE" -j DROP 2>/dev/null || true
  iptables -D FORWARD -m state --state ESTABLISHED,RELATED -j ACCEPT 2>/dev/null || true
  iptables -D FORWARD -i "$INET_IFACE" -o "$AP_IFACE" -j ACCEPT 2>/dev/null || true
  iptables -X CAPTIVE_WHITELIST 2>/dev/null || true

  echo 0 > /proc/sys/net/ipv4/ip_forward 2>/dev/null || true
  ip addr flush dev "$AP_IFACE" 2>/dev/null || true
  nmcli device set "$AP_IFACE" managed yes 2>/dev/null || true
  rm -f "$DNSMASQ_PID" /tmp/fastnet_*.conf /tmp/fastnet_*.log
  echo -e "${G}FastNet stopped. Interfaces restored.${NC}"
  exit 0
}
trap cleanup SIGINT SIGTERM

# ═══════════════════════════════════════════════════════════════
# PRE-FLIGHT
# ═══════════════════════════════════════════════════════════════
clear
echo -e "${G}${BOLD}"
echo "  ███████╗ █████╗ ███████╗████████╗███╗   ██╗███████╗████████╗"
echo "  ██╔════╝██╔══██╗██╔════╝╚══██╔══╝████╗  ██║██╔════╝╚══██╔══╝"
echo "  █████╗  ███████║███████╗   ██║   ██╔██╗ ██║█████╗     ██║   "
echo "  ██╔══╝  ██╔══██║╚════██║   ██║   ██║╚██╗██║██╔══╝     ██║   "
echo "  ██║     ██║  ██║███████║   ██║   ██║ ╚████║███████╗   ██║   "
echo "  ╚═╝     ╚═╝  ╚═╝╚══════╝   ╚═╝   ╚═╝  ╚═══╝╚══════╝   ╚═╝   "
echo -e "${NC}"
echo -e "${DIM}  FastNet Hotspot — Captive Portal Controller${NC}"
echo ""

[[ $EUID -ne 0 ]] && die "Run as root: sudo bash $0"

if [[ "$PORTAL_URL" == "https://YOUR-APP.replit.app" ]]; then
  die "Edit PORTAL_URL at the top of the script with your actual Replit URL."
fi

ip link show "$INET_IFACE" &>/dev/null || die "Internet interface '$INET_IFACE' not found. Run: ip link show"
ip link show "$AP_IFACE"   &>/dev/null || die "AP interface '$AP_IFACE' not found. Run: ip link show"

info "Checking internet on $INET_IFACE..."
ping -I "$INET_IFACE" -c 1 -W 3 8.8.8.8 &>/dev/null \
  && ok "Internet UP on $INET_IFACE" \
  || warn "Cannot reach 8.8.8.8 on $INET_IFACE — check WiFi connection"

# ═══════════════════════════════════════════════════════════════
# DEPENDENCIES
# ═══════════════════════════════════════════════════════════════
info "Checking dependencies..."
MISSING=()
for tool in dnsmasq python3 dig; do
  command -v "$tool" &>/dev/null || MISSING+=("$tool")
done
[[ "${#MISSING[@]}" -gt 0 ]] && {
  info "Installing: ${MISSING[*]}"
  apt-get update -qq && apt-get install -y "${MISSING[@]}" dnsutils > /dev/null 2>&1
}
ok "Dependencies ready."

# ═══════════════════════════════════════════════════════════════
# NETWORK MANAGER — ignore AP interface only
# ═══════════════════════════════════════════════════════════════
info "Telling NetworkManager to release $AP_IFACE..."
nmcli device set "$AP_IFACE" managed no 2>/dev/null || true
sleep 1
ok "$INET_IFACE stays NM-managed, $AP_IFACE handed off."

# ═══════════════════════════════════════════════════════════════
# AP INTERFACE
# ═══════════════════════════════════════════════════════════════
info "Configuring $AP_IFACE at $KALI_IP/24..."
ip addr flush dev "$AP_IFACE"
ip addr add "${KALI_IP}/24" dev "$AP_IFACE"
ip link set "$AP_IFACE" up
ok "$AP_IFACE is up at $KALI_IP"

# ═══════════════════════════════════════════════════════════════
# RESOLVE PORTAL IPs (before dnsmasq starts — uses real DNS)
# ═══════════════════════════════════════════════════════════════
info "Resolving portal domain for firewall whitelist..."
PORTAL_DOMAIN=$(echo "$PORTAL_URL" | sed -e 's|^[^/]*//||' -e 's|/.*||')
PORTAL_IPS=$(dig @8.8.8.8 +short "$PORTAL_DOMAIN" 2>/dev/null | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$')
if [[ -z "$PORTAL_IPS" ]]; then
  warn "Could not resolve $PORTAL_DOMAIN — using Cloudflare/Replit CIDR fallbacks"
  PORTAL_IPS="104.18.0.0/16 172.64.0.0/13 34.120.0.0/14"
fi
ok "Portal: $PORTAL_DOMAIN → $PORTAL_IPS"

# ═══════════════════════════════════════════════════════════════
# DNSMASQ — DHCP + DNS for AP clients
#
# KEY: forward *.replit.app to 8.8.8.8 so clients can resolve
#      and load the portal after the 302 redirect.
#      Everything else is sinkholed to Kali so OS probes hit
#      the redirect server and trigger the captive-portal popup.
# ═══════════════════════════════════════════════════════════════
info "Starting dnsmasq (DHCP + DNS)..."
pkill -f "dnsmasq.*fastnet" 2>/dev/null || true; sleep 1

DNSMASQ_CONF="/tmp/fastnet_dnsmasq.conf"
cat > "$DNSMASQ_CONF" << EOF
interface=${AP_IFACE}
bind-interfaces
no-dhcp-interface=lo
dhcp-range=${DHCP_START},${DHCP_END},255.255.255.0,24h
dhcp-option=3,${KALI_IP}
dhcp-option=6,${KALI_IP}

# ── Forward portal domains to real DNS ──────────────────────
# Without this, *.replit.app resolves to Kali's IP and the
# portal never loads after the 302 redirect.
server=/replit.app/8.8.8.8
server=/replit.dev/8.8.8.8

# ── Captive-portal detection domains ────────────────────────
# These HTTP-only probes trigger the "sign in to network" popup.
address=/connectivitycheck.gstatic.com/${KALI_IP}
address=/captive.apple.com/${KALI_IP}
address=/www.msftconnecttest.com/${KALI_IP}
address=/www.msftncsi.com/${KALI_IP}
address=/detectportal.firefox.com/${KALI_IP}

# ── Sinkhole everything else ─────────────────────────────────
address=/#/${KALI_IP}

dhcp-leasefile=${LEASES_FILE}
pid-file=${DNSMASQ_PID}
log-facility=/tmp/fastnet_dnsmasq.log
EOF

dnsmasq --conf-file="$DNSMASQ_CONF" || die "dnsmasq failed. Test: dnsmasq --conf-file=$DNSMASQ_CONF --test"
sleep 1
pgrep -x dnsmasq &>/dev/null || die "dnsmasq failed to start."
ok "dnsmasq running — DHCP: $DHCP_START–$DHCP_END"

# ═══════════════════════════════════════════════════════════════
# IP FORWARDING + NAT
# ═══════════════════════════════════════════════════════════════
info "Enabling IP forwarding and NAT..."
echo 1 > /proc/sys/net/ipv4/ip_forward
iptables -t nat -D POSTROUTING -o "$INET_IFACE" -j MASQUERADE 2>/dev/null || true
iptables -t nat -A POSTROUTING -o "$INET_IFACE" -j MASQUERADE
iptables -D FORWARD -m state --state ESTABLISHED,RELATED -j ACCEPT 2>/dev/null || true
iptables -A FORWARD -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -F CAPTIVE_WHITELIST 2>/dev/null || true
iptables -X CAPTIVE_WHITELIST 2>/dev/null || true
iptables -N CAPTIVE_WHITELIST
ok "NAT enabled: $AP_IFACE → $INET_IFACE"

# ═══════════════════════════════════════════════════════════════
# WHITELIST PORTAL IPs
# Must be inserted BEFORE the DNAT redirect rules so portal
# traffic is never hijacked by the redirect server.
# ═══════════════════════════════════════════════════════════════
info "Whitelisting portal IPs..."
for ip in $PORTAL_IPS; do
  iptables -t nat -I PREROUTING -i "$AP_IFACE" -d "$ip" -j ACCEPT
  iptables -I CAPTIVE_WHITELIST -d "$ip" -j ACCEPT
  echo -e "    ${DIM}whitelisted $ip${NC}"
done
ok "Portal IPs whitelisted"

# ═══════════════════════════════════════════════════════════════
# CAPTIVE PORTAL REDIRECT
#
# Only redirect HTTP (port 80) — OS captive-portal probes use HTTP.
# Do NOT redirect HTTPS (443): paid users need HTTPS directly,
# and redirecting it causes SSL errors before they've paid.
# ═══════════════════════════════════════════════════════════════
info "Setting up captive portal iptables rules..."
iptables -t nat -D PREROUTING -i "$AP_IFACE" -p tcp --dport 80 \
  -j DNAT --to-destination "${KALI_IP}:${REDIRECT_PORT}" 2>/dev/null || true

iptables -t nat -A PREROUTING -i "$AP_IFACE" -p tcp --dport 80 \
  -j DNAT --to-destination "${KALI_IP}:${REDIRECT_PORT}"

iptables -A INPUT -i "$AP_IFACE" -p udp --dport 67:68 -j ACCEPT
iptables -A INPUT -i "$AP_IFACE" -p udp --dport 53 -j ACCEPT
iptables -A INPUT -i "$AP_IFACE" -p tcp --dport 53 -j ACCEPT
iptables -A INPUT -i "$AP_IFACE" -p tcp --dport "$REDIRECT_PORT" -j ACCEPT

iptables -D FORWARD -i "$AP_IFACE" -j CAPTIVE_WHITELIST 2>/dev/null || true
iptables -D FORWARD -i "$AP_IFACE" -j DROP 2>/dev/null || true
iptables -A FORWARD -i "$AP_IFACE" -j CAPTIVE_WHITELIST
iptables -A FORWARD -i "$AP_IFACE" -j DROP
iptables -D FORWARD -i "$INET_IFACE" -o "$AP_IFACE" -j ACCEPT 2>/dev/null || true
iptables -A FORWARD -i "$INET_IFACE" -o "$AP_IFACE" -j ACCEPT
ok "Captive portal: HTTP(80) → $KALI_IP:$REDIRECT_PORT | HTTPS(443) direct to Replit"

# ═══════════════════════════════════════════════════════════════
# HTTP REDIRECT SERVER (Python, background)
# Responds to every HTTP request with a 302 to the portal URL.
# Passes ?client_ip=<ip> so the portal can identify the device.
# ═══════════════════════════════════════════════════════════════
info "Starting HTTP redirect server on port $REDIRECT_PORT..."
python3 - << PYEOF &
# fastnet_redirect_inline
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import quote

PORTAL = "${PORTAL_URL}"
PORT   = ${REDIRECT_PORT}
LOG    = open("/tmp/fastnet_redirect.log", "a")

class Handler(BaseHTTPRequestHandler):
    def handle_request(self):
        ip  = self.client_address[0]
        sep = "&" if "?" in PORTAL else "?"
        url = f"{PORTAL}{sep}client_ip={quote(ip)}"
        self.send_response(302)
        self.send_header("Location", url)
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.end_headers()
        LOG.write(f"REDIRECT {ip} -> {url}\n"); LOG.flush()
    do_GET = do_POST = do_HEAD = handle_request
    def log_message(self, *a): pass

HTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
PYEOF
REDIRECT_PID=$!
PIDS_TO_KILL+=($REDIRECT_PID)
sleep 1
kill -0 $REDIRECT_PID 2>/dev/null || die "Redirect server failed to start."
ok "Redirect server running (pid $REDIRECT_PID)"

# ═══════════════════════════════════════════════════════════════
# UNBLOCK POLLER (Python, background)
# Every 5s polls /api/sessions/paid-ips.
# For each paid session with an IP → insert iptables ACCEPT rule.
# When session expires / admin disconnects → revoke the rule.
# ═══════════════════════════════════════════════════════════════
info "Starting unblock poller (paid users)..."
python3 - << PYEOF &
# fastnet_unblock_inline
import subprocess, time, json, urllib.request, urllib.error

API  = "${PORTAL_URL}/api/sessions/paid-ips"
WIFI = "${AP_IFACE}"
ETH  = "${INET_IFACE}"
LOG  = open("/tmp/fastnet_unblock.log", "a")
active = {}   # sessionId -> ip

def run(cmd): subprocess.run(cmd, shell=True, capture_output=True)

def allow(ip, sid):
    run(f"iptables -I CAPTIVE_WHITELIST -s {ip} -j ACCEPT")
    run(f"iptables -I FORWARD -s {ip} -i {WIFI} -o {ETH} -j ACCEPT")
    LOG.write(f"ALLOW  {ip}  sid={sid}\n"); LOG.flush()
    print(f"[ALLOW]  {ip}", flush=True)

def revoke(ip, sid):
    run(f"iptables -D CAPTIVE_WHITELIST -s {ip} -j ACCEPT")
    run(f"iptables -D FORWARD -s {ip} -i {WIFI} -o {ETH} -j ACCEPT")
    LOG.write(f"REVOKE {ip}  sid={sid}\n"); LOG.flush()
    print(f"[REVOKE] {ip}", flush=True)

while True:
    try:
        with urllib.request.urlopen(API, timeout=8) as r:
            paid = {e["sessionId"]: e["ipAddress"]
                    for e in json.loads(r.read()) if e.get("ipAddress")}
        for sid, ip in paid.items():
            if sid not in active:
                allow(ip, sid); active[sid] = ip
        for sid in list(active):
            if sid not in paid:
                revoke(active.pop(sid), sid)
    except urllib.error.URLError as e:
        LOG.write(f"POLL_ERR {e}\n"); LOG.flush()
    except Exception as e:
        LOG.write(f"POLL_ERR {e}\n"); LOG.flush()
    time.sleep(5)
PYEOF
UNBLOCK_PID=$!
PIDS_TO_KILL+=($UNBLOCK_PID)
sleep 1
ok "Unblock poller running (pid $UNBLOCK_PID)"

# ═══════════════════════════════════════════════════════════════
# LIVE DASHBOARD — foreground loop
# ═══════════════════════════════════════════════════════════════
STARTED_AT=$(date "+%H:%M:%S")

get_clients() {
  [[ -f "$LEASES_FILE" ]] || { echo -e "    ${DIM}none yet${NC}"; return; }
  local count=0
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    local expiry mac ip hostname _
    read -r expiry mac ip hostname _ <<< "$line"
    local paid_ips
    paid_ips=$(iptables -L CAPTIVE_WHITELIST -n 2>/dev/null | awk '{print $4}')
    local status="${R}CAPTIVE${NC}"
    echo "$paid_ips" | grep -qF "$ip" && status="${G}PAID/ONLINE${NC}"
    echo -e "    ${W}$ip${NC}  ${DIM}$mac${NC}  ${hostname:-unknown}  [$status]"
    count=$((count+1))
  done < "$LEASES_FILE"
  [[ $count -eq 0 ]] && echo -e "    ${DIM}none yet${NC}"
}

get_recent_redirects() {
  [[ -f /tmp/fastnet_redirect.log ]] || { echo -e "    ${DIM}none yet${NC}"; return; }
  [[ "$(wc -l < /tmp/fastnet_redirect.log)" -eq 0 ]] && { echo -e "    ${DIM}none yet${NC}"; return; }
  tail -5 /tmp/fastnet_redirect.log | while read -r l; do
    echo -e "    ${C}→${NC} $l"
  done
}

get_unblock_events() {
  [[ -f /tmp/fastnet_unblock.log ]] || { echo -e "    ${DIM}none yet${NC}"; return; }
  [[ "$(wc -l < /tmp/fastnet_unblock.log)" -eq 0 ]] && { echo -e "    ${DIM}none yet${NC}"; return; }
  tail -4 /tmp/fastnet_unblock.log | while read -r l; do
    echo "$l" | grep -q "ALLOW"  && { echo -e "    ${G}UNBLOCKED${NC}: $l"; continue; }
    echo "$l" | grep -q "REVOKE" && { echo -e "    ${R}EXPIRED${NC}: $l";   continue; }
    echo -e "    ${DIM}$l${NC}"
  done
}

svc_status() { kill -0 "$1" 2>/dev/null && echo -e "${G}RUNNING${NC}" || echo -e "${R}DOWN${NC}"; }
inet_status() { ping -I "$INET_IFACE" -c 1 -W 2 8.8.8.8 &>/dev/null && echo -e "${G}CONNECTED${NC}" || echo -e "${R}NO INTERNET${NC}"; }
ap_status()   { [[ "$(cat /sys/class/net/$AP_IFACE/operstate 2>/dev/null)" == "up" ]] && echo -e "${G}UP${NC}" || echo -e "${R}DOWN — plug in AP/switch${NC}"; }

echo ""
echo -e "${G}${BOLD}  All systems running. Ctrl+C to stop cleanly.${NC}"
echo ""

while true; do
  clear
  TIMESTAMP=$(date "+%Y-%m-%d %H:%M:%S")
  WL_COUNT=$(iptables -L CAPTIVE_WHITELIST -n 2>/dev/null | grep -c "ACCEPT" || echo 0)
  RD_TOTAL=$(wc -l < /tmp/fastnet_redirect.log 2>/dev/null || echo 0)
  LEASES=$(grep -c "" "$LEASES_FILE" 2>/dev/null || echo 0)

  echo -e "${G}${BOLD}  FastNet Hotspot${NC}  ${DIM}$TIMESTAMP  (started $STARTED_AT)${NC}"
  echo -e "  ${DIM}Ctrl+C to stop cleanly${NC}"
  echo ""

  echo -e "  ${BOLD}INTERFACES${NC}"
  echo -e "    Internet  (${W}$INET_IFACE${NC}): $(inet_status)"
  echo -e "    AP output (${W}$AP_IFACE${NC}):  $(ap_status)"
  echo ""

  echo -e "  ${BOLD}SERVICES${NC}"
  echo -e "    Redirect server : $(svc_status $REDIRECT_PID)  port ${REDIRECT_PORT}"
  echo -e "    Unblock poller  : $(svc_status $UNBLOCK_PID)  every 5s"
  echo -e "    DHCP / DNS      : $(pgrep -x dnsmasq &>/dev/null && echo -e "${G}RUNNING${NC}" || echo -e "${R}DOWN${NC}")"
  echo -e "    Portal URL      : ${C}${PORTAL_URL}${NC}"
  echo ""

  echo -e "  ${BOLD}PORTAL DNS${NC}"
  echo -e "    ${DIM}*.replit.app → 8.8.8.8 (clients get real IP, portal loads)${NC}"
  echo -e "    ${DIM}Portal IPs whitelisted: $(echo $PORTAL_IPS | tr '\n' ' ')${NC}"
  echo ""

  echo -e "  ${BOLD}CONNECTED CLIENTS${NC}  ${DIM}($LEASES DHCP leases | $WL_COUNT whitelisted IPs)${NC}"
  get_clients
  echo ""

  echo -e "  ${BOLD}RECENT REDIRECTS${NC}  ${DIM}(last 5 — total: $RD_TOTAL)${NC}"
  get_recent_redirects
  echo ""

  echo -e "  ${BOLD}UNBLOCK / REVOKE EVENTS${NC}"
  get_unblock_events
  echo ""

  echo -e "  ${DIM}──────────────────────────────────────────────────────────${NC}"
  PAID_SRC=$(iptables -L CAPTIVE_WHITELIST -n 2>/dev/null | awk '/ACCEPT/{print $4}' | grep -v '^0\.' | paste -sd ',' - 2>/dev/null || echo "none")
  echo -e "  ${DIM}Active paid IPs: $PAID_SRC${NC}"
  echo -e "  ${DIM}Refreshing every ${REFRESH_SECS}s...${NC}"

  sleep $REFRESH_SECS
done
