import { useState, useEffect } from "react";
import {
  useListSessions,
  useGetSessionStats,
  useListPackages,
  useListVisitors,
  useCreatePackage,
  useUpdatePackage,
  useDeletePackage,
  useCreateSession,
  useDisconnectSession,
  getListPackagesQueryKey,
  getListSessionsQueryKey,
  getGetSessionStatsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Activity, Users, DollarSign, Clock, Plus, MoreHorizontal,
  Pencil, Trash2, Wifi, UserPlus, WifiOff, RefreshCw,
  Smartphone, Monitor, Tablet, Eye, Router, Link, Copy,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const AUTO_REFRESH_SECS = 20;

function StatusBadge({ status }: { status: string }) {
  if (status === "paid")    return <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200 font-semibold">PAID</Badge>;
  if (status === "expired") return <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200 font-semibold">EXPIRED</Badge>;
  return <Badge variant="outline" className="bg-orange-100 text-orange-700 border-orange-200 font-semibold">PENDING</Badge>;
}

export default function Admin() {
  const queryClient = useQueryClient();

  const { data: stats,    refetch: refetchStats }    = useGetSessionStats();
  const { data: sessions = [], refetch: refetchSessions } = useListSessions();
  const { data: packages = [] }                       = useListPackages();
  const { data: visitors = [], refetch: refetchVisitors } = useListVisitors({ query: { refetchInterval: 10000 } });

  const createPackage     = useCreatePackage();
  const updatePackage     = useUpdatePackage();
  const deletePackage     = useDeletePackage();
  const createSession     = useCreateSession();
  const disconnectSession = useDisconnectSession();

  // ── Auto-refresh ─────────────────────────────────────────
  const [countdown, setCountdown] = useState(AUTO_REFRESH_SECS);
  useEffect(() => {
    const tick = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          refetchSessions();
          refetchStats();
          return AUTO_REFRESH_SECS;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  function manualRefresh() {
    refetchSessions();
    refetchStats();
    refetchVisitors();
    setCountdown(AUTO_REFRESH_SECS);
  }

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetSessionStatsQueryKey() });
  }

  // ── Package modal ─────────────────────────────────────────
  const [pkgModalOpen, setPkgModalOpen] = useState(false);
  const [editingPkgId, setEditingPkgId] = useState<number | null>(null);
  const [pkgName, setPkgName]           = useState("");
  const [pkgPrice, setPkgPrice]         = useState("");
  const [pkgHours, setPkgHours]         = useState("");
  const [pkgData, setPkgData]           = useState("0");
  const [pkgDesc, setPkgDesc]           = useState("");
  const [pkgActive, setPkgActive]       = useState(true);

  // ── Add user modal ────────────────────────────────────────
  const [addUserOpen, setAddUserOpen]   = useState(false);
  const [userPhone, setUserPhone]       = useState("");
  const [userPkgId, setUserPkgId]       = useState<string>("");
  const [userDevices, setUserDevices]   = useState("1");
  const [addingUser, setAddingUser]     = useState(false);
  const [addSuccess, setAddSuccess]     = useState("");

  // ── Grant access from visitor row ─────────────────────────
  type VisitorItem = { ipAddress: string; deviceType: string; os: string; browser: string; userAgent: string };
  const [grantVisitor, setGrantVisitor]   = useState<VisitorItem | null>(null);
  const [grantPhone, setGrantPhone]       = useState("");
  const [grantPkgId, setGrantPkgId]       = useState<string>("");
  const [granting, setGranting]           = useState(false);
  const [grantSuccess, setGrantSuccess]   = useState(false);

  async function handleGrantAccess() {
    if (!grantVisitor || !grantPkgId) return;
    setGranting(true);
    try {
      await createSession.mutateAsync({
        data: {
          phone: grantPhone.trim() || `visitor-${grantVisitor.ipAddress}`,
          packageId: Number(grantPkgId),
          ipAddress: grantVisitor.ipAddress,
          adminCreated: true,
          numDevices: 1,
        },
      });
      invalidateAll();
      refetchVisitors();
      setGrantSuccess(true);
    } finally {
      setGranting(false);
    }
  }

  // ── Disconnect confirm ────────────────────────────────────
  const [confirmDisconnect, setConfirmDisconnect] = useState<number | null>(null);

  // ── Session filter — default to paid ─────────────────────
  const [statusFilter, setStatusFilter] = useState<"all" | "paid" | "pending" | "expired">("paid");

  // ── Router config ────────────────────────────────────────
  const [routerConfig, setRouterConfig] = useState<any>(null);
  const [routerName, setRouterName] = useState("");
  const [routerHost, setRouterHost] = useState("");
  const [routerPort, setRouterPort] = useState("8728");
  const [routerUser, setRouterUser] = useState("admin");
  const [routerPass, setRouterPass] = useState("");
  const [routerServer, setRouterServer] = useState("hotspot1");
  const [routerTestResult, setRouterTestResult] = useState<any>(null);
  const [routerSaving, setRouterSaving] = useState(false);
  const [callbackUrl, setCallbackUrl] = useState("");
  const [payheroConfigured, setPayheroConfigured] = useState(false);

  useEffect(() => {
    fetch("/api/router").then(r => r.json()).then(d => {
      if (d) {
        setRouterConfig(d);
        setRouterName(d.name || "");
        setRouterHost(d.host || "");
        setRouterPort(String(d.port || 8728));
        setRouterUser(d.username || "admin");
        setRouterPass(d.password || "");
        setRouterServer(d.hotspotServer || "hotspot1");
      }
    }).catch(() => {});
    fetch("/api/config").then(r => r.json()).then(d => {
      setCallbackUrl(d.callbackUrl || "");
      setPayheroConfigured(d.payheroConfigured || false);
    }).catch(() => {});
  }, []);

  const filteredSessions = statusFilter === "all"
    ? sessions
    : sessions.filter((s) => s.status === statusFilter);

  // ── Package handlers ──────────────────────────────────────
  function openNewPkg() {
    setEditingPkgId(null); setPkgName(""); setPkgPrice(""); setPkgHours("");
    setPkgData("0"); setPkgDesc(""); setPkgActive(true); setPkgModalOpen(true);
  }
  function openEditPkg(pkg: any) {
    setEditingPkgId(pkg.id); setPkgName(pkg.name); setPkgPrice(pkg.price.toString());
    setPkgHours(pkg.durationHours.toString()); setPkgData(pkg.dataLimitMb.toString());
    setPkgDesc(pkg.description || ""); setPkgActive(pkg.isActive ?? true); setPkgModalOpen(true);
  }
  async function savePkg() {
    const data = { name: pkgName, price: Number(pkgPrice), durationHours: Number(pkgHours), dataLimitMb: Number(pkgData), description: pkgDesc, isActive: pkgActive };
    if (editingPkgId) await updatePackage.mutateAsync({ id: editingPkgId, data });
    else await createPackage.mutateAsync({ data });
    queryClient.invalidateQueries({ queryKey: getListPackagesQueryKey() });
    setPkgModalOpen(false);
  }

  // ── Router handlers ──────────────────────────────────────
  async function saveRouter() {
    setRouterSaving(true);
    try {
      const data = { name: routerName, host: routerHost, port: Number(routerPort), username: routerUser, password: routerPass, hotspotServer: routerServer };
      const res = await fetch("/api/router", { method: routerConfig ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const saved = await res.json();
      setRouterConfig(saved);
    } finally { setRouterSaving(false); }
  }
  async function testRouter() {
    setRouterTestResult(null);
    try {
      const res = await fetch("/api/router/test", { method: "POST" });
      const data = await res.json();
      setRouterTestResult(data);
    } catch { setRouterTestResult({ success: false, error: "Connection failed" }); }
  }
  async function deletePkg(id: number) {
    if (!confirm("Delete this package?")) return;
    await deletePackage.mutateAsync({ id });
    queryClient.invalidateQueries({ queryKey: getListPackagesQueryKey() });
  }

  // ── Add user handler ──────────────────────────────────────
  async function handleAddUser() {
    if (!userPhone || !userPkgId) return;
    setAddingUser(true);
    setAddSuccess("");
    const n = Math.max(1, Math.min(20, parseInt(userDevices) || 1));
    try {
      await createSession.mutateAsync({
        data: { phone: userPhone, packageId: Number(userPkgId), adminCreated: true, numDevices: n },
      });
      invalidateAll();
      const pkg = packages.find((p) => p.id === Number(userPkgId));
      setAddSuccess(
        n === 1
          ? `Done! 1 device slot created for ${userPhone}.`
          : `Done! ${n} device slots created for ${userPhone}. Users login with this number on the portal.`
      );
      setUserPhone(""); setUserPkgId(""); setUserDevices("1");
    } finally {
      setAddingUser(false);
    }
  }

  // ── Disconnect handler ────────────────────────────────────
  async function handleDisconnect(id: number) {
    await disconnectSession.mutateAsync({ id });
    invalidateAll();
    setConfirmDisconnect(null);
  }

  return (
    <div className="min-h-screen bg-muted/30 pb-10">
      {/* Header */}
      <header className="bg-white border-b border-border/50 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary rounded-xl flex items-center justify-center text-primary-foreground">
              <Wifi className="w-4 h-4" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">SafNet Admin</h1>
          </div>
          <Button variant="outline" size="sm" className="rounded-xl gap-2 text-muted-foreground" onClick={manualRefresh}>
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh <span className="text-xs opacity-60">({countdown}s)</span>
          </Button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 pt-8 space-y-8">
        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Total Revenue", value: `KES ${stats?.revenue?.toLocaleString() ?? 0}`, icon: DollarSign, color: "primary" },
            { label: "Active Sessions", value: stats?.paid ?? 0, icon: Activity, color: "green-600" },
            { label: "Pending Payments", value: stats?.pending ?? 0, icon: Clock, color: "orange-600" },
            { label: "Total Users", value: stats?.total ?? 0, icon: Users, color: "blue-600" },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label} className="rounded-2xl border-border/50 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{label}</CardTitle>
                <div className={`w-8 h-8 rounded-full bg-${color}/10 flex items-center justify-center`}>
                  <Icon className={`h-4 w-4 text-${color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-extrabold">{value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ── LIVE VISITORS ─────────────────────────────── */}
        <Card className="rounded-2xl border-border/50 shadow-sm overflow-hidden">
          <CardHeader className="bg-white pb-4 border-b border-border/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                <CardTitle className="text-xl">Live Portal Visitors</CardTitle>
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 font-bold">
                  {visitors.length} online
                </Badge>
              </div>
              <CardDescription className="text-xs">Refreshes every 10s — anyone who opened the portal in the last 10 min</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            {visitors.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground flex flex-col items-center gap-2">
                <Eye className="w-8 h-8 opacity-30" />
                <p>No one on the portal right now</p>
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="font-semibold text-muted-foreground uppercase tracking-wider text-xs">Device</TableHead>
                    <TableHead className="font-semibold text-muted-foreground uppercase tracking-wider text-xs">IP Address</TableHead>
                    <TableHead className="font-semibold text-muted-foreground uppercase tracking-wider text-xs">OS</TableHead>
                    <TableHead className="font-semibold text-muted-foreground uppercase tracking-wider text-xs">Browser</TableHead>
                    <TableHead className="font-semibold text-muted-foreground uppercase tracking-wider text-xs">Payment Status</TableHead>
                    <TableHead className="font-semibold text-muted-foreground uppercase tracking-wider text-xs">First Seen</TableHead>
                    <TableHead className="font-semibold text-muted-foreground uppercase tracking-wider text-xs">Last Seen</TableHead>
                    <TableHead className="font-semibold text-muted-foreground uppercase tracking-wider text-xs w-[280px]">User Agent</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visitors.map((v) => {
                    const paidSession = sessions.find(
                      (s) => s.ipAddress === v.ipAddress && s.status === "paid"
                    );
                    const DeviceIcon = v.deviceType === "mobile"
                      ? Smartphone
                      : v.deviceType === "tablet"
                      ? Tablet
                      : Monitor;
                    return (
                      <TableRow key={v.ipAddress}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <DeviceIcon className={`w-4 h-4 ${
                              v.deviceType === "mobile" ? "text-blue-500"
                              : v.deviceType === "tablet" ? "text-purple-500"
                              : "text-gray-500"
                            }`} />
                            <span className="capitalize text-sm font-medium">{v.deviceType}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-xs bg-muted px-2 py-1 rounded-md">{v.ipAddress}</span>
                        </TableCell>
                        <TableCell className="text-sm">{v.os}</TableCell>
                        <TableCell className="text-sm">{v.browser}</TableCell>
                        <TableCell>
                          {paidSession ? (
                            <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200 font-semibold">
                              PAID — {paidSession.packageName}
                            </Badge>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="bg-orange-100 text-orange-700 border-orange-200 font-semibold">
                                NOT PAID
                              </Badge>
                              <Button
                                size="sm"
                                className="rounded-lg h-7 px-2 text-xs font-semibold gap-1 bg-green-600 hover:bg-green-700 text-white"
                                onClick={() => { setGrantVisitor(v); setGrantPhone(""); setGrantPkgId(""); setGrantSuccess(false); }}
                              >
                                <UserPlus className="w-3 h-3" /> Grant
                              </Button>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {new Date(v.firstSeenAt).toLocaleTimeString()}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {new Date(v.lastSeenAt).toLocaleTimeString()}
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground truncate block max-w-[260px]" title={v.userAgent}>
                            {v.userAgent}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Tabs defaultValue="sessions" className="w-full">
          <TabsList className="mb-6 bg-white border border-border/50 rounded-xl p-1 shadow-sm w-full max-w-sm grid grid-cols-3">
            <TabsTrigger value="sessions" className="rounded-lg font-semibold data-[state=active]:bg-muted">Sessions</TabsTrigger>
            <TabsTrigger value="packages" className="rounded-lg font-semibold data-[state=active]:bg-muted">Packages</TabsTrigger>
            <TabsTrigger value="router" className="rounded-lg font-semibold data-[state=active]:bg-muted">Router</TabsTrigger>
          </TabsList>

          {/* ── SESSIONS TAB ──────────────────────────────── */}
          <TabsContent value="sessions" className="space-y-4">
            <Card className="rounded-2xl border-border/50 shadow-sm overflow-hidden">
              <CardHeader className="bg-white pb-4 border-b border-border/50">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <CardTitle className="text-xl">Sessions</CardTitle>
                    <CardDescription>
                      Auto-refreshes every {AUTO_REFRESH_SECS}s.
                      {statusFilter === "paid" ? " Showing paid sessions only." : ""}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {(["paid", "all", "pending", "expired"] as const).map((f) => (
                      <Button
                        key={f}
                        size="sm"
                        variant={statusFilter === f ? "default" : "outline"}
                        className="rounded-xl h-8 px-3 text-xs font-semibold capitalize"
                        onClick={() => setStatusFilter(f)}
                      >
                        {f === "all"     ? `All (${sessions.length})`                               : null}
                        {f === "paid"    ? `Paid (${sessions.filter((s) => s.status === "paid").length})`    : null}
                        {f === "pending" ? `Pending (${sessions.filter((s) => s.status === "pending").length})` : null}
                        {f === "expired" ? `Expired (${sessions.filter((s) => s.status === "expired").length})` : null}
                      </Button>
                    ))}
                    <Button size="sm" className="rounded-xl h-8 gap-1.5 font-semibold" onClick={() => { setAddSuccess(""); setAddUserOpen(true); }}>
                      <UserPlus className="w-3.5 h-3.5" /> Add User
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="font-semibold text-muted-foreground uppercase tracking-wider text-xs">Phone</TableHead>
                      <TableHead className="font-semibold text-muted-foreground uppercase tracking-wider text-xs">IP Address</TableHead>
                      <TableHead className="font-semibold text-muted-foreground uppercase tracking-wider text-xs">Package</TableHead>
                      <TableHead className="font-semibold text-muted-foreground uppercase tracking-wider text-xs">Price</TableHead>
                      <TableHead className="font-semibold text-muted-foreground uppercase tracking-wider text-xs">Status</TableHead>
                      <TableHead className="font-semibold text-muted-foreground uppercase tracking-wider text-xs">Expires</TableHead>
                      <TableHead className="font-semibold text-muted-foreground uppercase tracking-wider text-xs">Date</TableHead>
                      <TableHead className="w-[60px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSessions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                          No {statusFilter !== "all" ? statusFilter : ""} sessions found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredSessions.map((session) => (
                        <TableRow key={session.id} className={session.status === "paid" ? "bg-green-50/30" : ""}>
                          <TableCell className="font-mono font-semibold text-sm">{session.phone}</TableCell>
                          <TableCell>
                            {session.ipAddress ? (
                              <span className="font-mono text-xs bg-muted px-2 py-1 rounded-md">{session.ipAddress}</span>
                            ) : (
                              <span className="text-muted-foreground text-xs italic">waiting for login</span>
                            )}
                          </TableCell>
                          <TableCell className="font-medium">{session.packageName ?? `#${session.packageId}`}</TableCell>
                          <TableCell className="font-medium">KES {session.packagePrice ?? 0}</TableCell>
                          <TableCell><StatusBadge status={session.status} /></TableCell>
                          <TableCell className="text-muted-foreground text-xs">
                            {session.expiresAt ? new Date(session.expiresAt).toLocaleString() : "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs">
                            {new Date(session.createdAt).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            {session.status === "paid" && (
                              <Button
                                size="icon" variant="ghost"
                                className="w-8 h-8 rounded-lg text-red-500 hover:bg-red-50 hover:text-red-600"
                                title="Disconnect"
                                onClick={() => setConfirmDisconnect(session.id)}
                              >
                                <WifiOff className="w-4 h-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── PACKAGES TAB ──────────────────────────────── */}
          <TabsContent value="packages" className="space-y-4">
            <Card className="rounded-2xl border-border/50 shadow-sm overflow-hidden">
              <CardHeader className="bg-white pb-4 border-b border-border/50 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-xl">Manage Packages</CardTitle>
                  <CardDescription>Configure the internet plans shown on the portal.</CardDescription>
                </div>
                <Button onClick={openNewPkg} className="rounded-xl gap-2 font-semibold">
                  <Plus className="w-4 h-4" /> New Package
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="font-semibold text-muted-foreground uppercase tracking-wider text-xs">Name</TableHead>
                      <TableHead className="font-semibold text-muted-foreground uppercase tracking-wider text-xs">Price</TableHead>
                      <TableHead className="font-semibold text-muted-foreground uppercase tracking-wider text-xs">Duration</TableHead>
                      <TableHead className="font-semibold text-muted-foreground uppercase tracking-wider text-xs">Data</TableHead>
                      <TableHead className="font-semibold text-muted-foreground uppercase tracking-wider text-xs">Status</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {packages.map((pkg) => (
                      <TableRow key={pkg.id}>
                        <TableCell className="font-bold">{pkg.name}</TableCell>
                        <TableCell className="font-semibold text-primary">KES {pkg.price}</TableCell>
                        <TableCell>{pkg.durationHours}h</TableCell>
                        <TableCell>
                          {pkg.dataLimitMb === 0
                            ? <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Unlimited</Badge>
                            : `${pkg.dataLimitMb} MB`}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={pkg.isActive !== false ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-100 text-gray-500"}>
                            {pkg.isActive !== false ? "Active" : "Hidden"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="rounded-lg w-8 h-8">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40 rounded-xl">
                              <DropdownMenuItem onClick={() => openEditPkg(pkg)} className="cursor-pointer gap-2">
                                <Pencil className="w-4 h-4" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => deletePkg(pkg.id)} className="cursor-pointer text-destructive focus:text-destructive gap-2">
                                <Trash2 className="w-4 h-4" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── ROUTER TAB ───────────────────────────────── */}
          <TabsContent value="router" className="space-y-6">
            {/* MikroTik Connection */}
            <Card className="rounded-2xl border-border/50 shadow-sm overflow-hidden">
              <CardHeader className="bg-white pb-4 border-b border-border/50">
                <div className="flex items-center gap-2">
                  <Router className="w-5 h-5 text-primary" />
                  <CardTitle className="text-xl">MikroTik Router Connection</CardTitle>
                </div>
                <CardDescription>Connect to your MikroTik router to manage hotspot users automatically.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label className="font-semibold text-muted-foreground uppercase tracking-wider text-xs">Router Name</Label>
                    <Input value={routerName} onChange={(e) => setRouterName(e.target.value)} className="rounded-xl" placeholder="e.g. Main Router" />
                  </div>
                  <div className="grid gap-2">
                    <Label className="font-semibold text-muted-foreground uppercase tracking-wider text-xs">Hotspot Server</Label>
                    <Input value={routerServer} onChange={(e) => setRouterServer(e.target.value)} className="rounded-xl" placeholder="hotspot1" />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="grid gap-2 sm:col-span-2">
                    <Label className="font-semibold text-muted-foreground uppercase tracking-wider text-xs">Router IP / Hostname</Label>
                    <Input value={routerHost} onChange={(e) => setRouterHost(e.target.value)} className="rounded-xl" placeholder="192.168.1.1" />
                  </div>
                  <div className="grid gap-2">
                    <Label className="font-semibold text-muted-foreground uppercase tracking-wider text-xs">API Port</Label>
                    <Input type="number" value={routerPort} onChange={(e) => setRouterPort(e.target.value)} className="rounded-xl" placeholder="8728" />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label className="font-semibold text-muted-foreground uppercase tracking-wider text-xs">Username</Label>
                    <Input value={routerUser} onChange={(e) => setRouterUser(e.target.value)} className="rounded-xl" placeholder="admin" />
                  </div>
                  <div className="grid gap-2">
                    <Label className="font-semibold text-muted-foreground uppercase tracking-wider text-xs">Password</Label>
                    <Input type="password" value={routerPass} onChange={(e) => setRouterPass(e.target.value)} className="rounded-xl" placeholder="••••••" />
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button onClick={saveRouter} disabled={routerSaving || !routerHost} className="rounded-xl gap-2 font-semibold">
                    {routerSaving ? "Saving..." : "Save Connection"}
                  </Button>
                  <Button variant="outline" onClick={testRouter} disabled={!routerHost} className="rounded-xl gap-2 font-semibold">
                    Test Connection
                  </Button>
                </div>
                {routerTestResult && (
                  <div className={`p-3 rounded-xl text-sm font-medium ${routerTestResult.success ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                    {routerTestResult.success ? `Connected to ${routerTestResult.router?.identity || routerHost}` : `Failed: ${routerTestResult.error}`}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* PayHero Callback URL */}
            <Card className="rounded-2xl border-border/50 shadow-sm overflow-hidden">
              <CardHeader className="bg-white pb-4 border-b border-border/50">
                <div className="flex items-center gap-2">
                  <Link className="w-5 h-5 text-primary" />
                  <CardTitle className="text-xl">PayHero Callback URL</CardTitle>
                </div>
                <CardDescription>Configure this URL in your PayHero dashboard to receive payment confirmations.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-6">
                <div className="p-4 bg-muted/50 rounded-xl">
                  <Label className="font-semibold text-muted-foreground uppercase tracking-wider text-xs mb-2 block">Your Callback URL</Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-3 bg-white rounded-lg border border-border/50 text-sm font-mono break-all">
                      {callbackUrl || "Loading..."}
                    </code>
                    <Button variant="outline" size="sm" className="rounded-xl gap-2 shrink-0" onClick={() => { navigator.clipboard.writeText(callbackUrl); }}>
                      <Copy className="w-3.5 h-3.5" /> Copy
                    </Button>
                  </div>
                </div>
                <div className={`p-3 rounded-xl text-sm font-medium ${payheroConfigured ? "bg-green-50 text-green-700 border border-green-200" : "bg-orange-50 text-orange-700 border border-orange-200"}`}>
                  {payheroConfigured ? "PayHero is configured" : "PayHero API key not set — add PAYHERO_API_KEY in Render environment"}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* ── ADD USER MODAL ───────────────────────────────── */}
      <Dialog open={addUserOpen} onOpenChange={(o) => { if (!o) setAddSuccess(""); setAddUserOpen(o); }}>
        <DialogContent className="sm:max-w-[440px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Add User Manually</DialogTitle>
            <DialogDescription>
              Grant internet access by phone number. Users log in on the portal using that number — no M-Pesa needed.
            </DialogDescription>
          </DialogHeader>

          {addSuccess ? (
            <div className="py-6 text-center space-y-4">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <Activity className="w-7 h-7 text-green-600" />
              </div>
              <p className="font-semibold text-green-800">{addSuccess}</p>
              <p className="text-sm text-muted-foreground">
                Tell the user to open the portal and tap <strong>"Already have a plan? Login with your phone number"</strong>.
              </p>
              <Button onClick={() => { setAddSuccess(""); setAddUserOpen(false); }} className="rounded-xl w-full">Done</Button>
            </div>
          ) : (
            <>
              <div className="grid gap-4 py-2">
                <div className="grid gap-2">
                  <Label className="font-semibold text-muted-foreground uppercase tracking-wider text-xs">Phone Number</Label>
                  <Input
                    placeholder="0712 345 678"
                    value={userPhone}
                    onChange={(e) => setUserPhone(e.target.value)}
                    className="rounded-xl text-lg font-mono"
                    type="tel"
                  />
                </div>
                <div className="grid gap-2">
                  <Label className="font-semibold text-muted-foreground uppercase tracking-wider text-xs">Package</Label>
                  <Select value={userPkgId} onValueChange={setUserPkgId}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder="Select a package..." />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {packages.filter((p) => p.isActive !== false).map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.name} — KES {p.price} ({p.durationHours}h{p.dataLimitMb === 0 ? ", Unlimited" : `, ${p.dataLimitMb}MB`})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label className="font-semibold text-muted-foreground uppercase tracking-wider text-xs">Number of Devices</Label>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={userDevices}
                    onChange={(e) => setUserDevices(e.target.value)}
                    className="rounded-xl"
                    placeholder="1"
                  />
                  <p className="text-xs text-muted-foreground">
                    Creates this many login slots. E.g. set 3 so 3 different devices can connect using the same phone number.
                  </p>
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setAddUserOpen(false)} className="rounded-xl">Cancel</Button>
                <Button
                  onClick={handleAddUser}
                  disabled={!userPhone || !userPkgId || addingUser}
                  className="rounded-xl gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  {addingUser ? "Creating..." : "Grant Access"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── DISCONNECT CONFIRM ───────────────────────────── */}
      <Dialog open={confirmDisconnect !== null} onOpenChange={() => setConfirmDisconnect(null)}>
        <DialogContent className="sm:max-w-[380px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-red-600">Disconnect User?</DialogTitle>
            <DialogDescription>
              This will immediately expire their session. Their device will be blocked and redirected back to the portal.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setConfirmDisconnect(null)} className="rounded-xl">Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => confirmDisconnect && handleDisconnect(confirmDisconnect)}
              disabled={disconnectSession.isPending}
              className="rounded-xl gap-2"
            >
              <WifiOff className="w-4 h-4" />
              {disconnectSession.isPending ? "Disconnecting..." : "Disconnect"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── PACKAGE MODAL ───────────────────────────────── */}
      <Dialog open={pkgModalOpen} onOpenChange={setPkgModalOpen}>
        <DialogContent className="sm:max-w-[425px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">{editingPkgId ? "Edit Package" : "Create Package"}</DialogTitle>
            <DialogDescription>Configure the details for this internet package.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label className="font-semibold text-muted-foreground uppercase tracking-wider text-xs">Name</Label>
              <Input value={pkgName} onChange={(e) => setPkgName(e.target.value)} className="rounded-xl" placeholder="e.g. 1 Hour Unlimited" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label className="font-semibold text-muted-foreground uppercase tracking-wider text-xs">Price (KES)</Label>
                <Input type="number" value={pkgPrice} onChange={(e) => setPkgPrice(e.target.value)} className="rounded-xl" placeholder="20" />
              </div>
              <div className="grid gap-2">
                <Label className="font-semibold text-muted-foreground uppercase tracking-wider text-xs">Duration (Hours)</Label>
                <Input type="number" value={pkgHours} onChange={(e) => setPkgHours(e.target.value)} className="rounded-xl" placeholder="1" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label className="font-semibold text-muted-foreground uppercase tracking-wider text-xs">Data Limit (MB)</Label>
              <Input type="number" value={pkgData} onChange={(e) => setPkgData(e.target.value)} className="rounded-xl" placeholder="0 for unlimited" />
              <p className="text-xs text-muted-foreground">Use 0 for unlimited data.</p>
            </div>
            <div className="grid gap-2">
              <Label className="font-semibold text-muted-foreground uppercase tracking-wider text-xs">Description (Optional)</Label>
              <Textarea value={pkgDesc} onChange={(e) => setPkgDesc(e.target.value)} className="rounded-xl resize-none" placeholder="Fast and reliable..." />
            </div>
            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-xl">
              <div>
                <Label className="text-base font-semibold">Active Status</Label>
                <p className="text-sm text-muted-foreground">Show on portal</p>
              </div>
              <Switch checked={pkgActive} onCheckedChange={setPkgActive} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPkgModalOpen(false)} className="rounded-xl">Cancel</Button>
            <Button onClick={savePkg} className="rounded-xl" disabled={!pkgName || !pkgPrice || !pkgHours}>
              {editingPkgId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
