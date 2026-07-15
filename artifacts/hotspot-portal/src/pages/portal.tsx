import { useState, useEffect } from "react";
import {
  useListPackages,
  useCreateSession,
  useInitiatePayment,
  useGetPaymentStatus,
  usePhoneLogin,
  usePingVisitor,
  getGetPaymentStatusQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Wifi, CheckCircle2, AlertCircle, Phone } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function Portal() {
  const { data: packages = [], isLoading: isLoadingPackages } = useListPackages();
  const createSession  = useCreateSession();
  const initiatePayment = useInitiatePayment();
  const phoneLogin     = usePhoneLogin();
  const queryClient    = useQueryClient();

  const clientIp = new URLSearchParams(window.location.search).get("client_ip") ?? undefined;

  // ── Ping visitor on load ──────────────────────────────────
  const pingVisitor = usePingVisitor();
  useEffect(() => {
    if (clientIp) {
      pingVisitor.mutate({ data: { ipAddress: clientIp, userAgent: navigator.userAgent } });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientIp]);

  // ── Buy flow ──────────────────────────────────────────────
  const [selectedPackage, setSelectedPackage] = useState<number | null>(null);
  const [phone, setPhone]                     = useState("");
  const [phoneModalOpen, setPhoneModalOpen]   = useState(false);
  const [paymentRef, setPaymentRef]           = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus]     = useState<"pending" | "paid" | "failed" | null>(null);

  // ── Phone-login flow ──────────────────────────────────────
  const [loginModalOpen, setLoginModalOpen]   = useState(false);
  const [loginPhone, setLoginPhone]           = useState("");
  const [loginStatus, setLoginStatus]         = useState<"idle" | "loading" | "success" | "error">("idle");
  const [loginError, setLoginError]           = useState("");

  const { data: statusData } = useGetPaymentStatus(paymentRef as string, {
    query: {
      enabled: !!paymentRef && paymentStatus === "pending",
      queryKey: getGetPaymentStatusQueryKey(paymentRef as string),
      refetchInterval: (query) => {
        if (query.state.data?.status === "pending") return 3000;
        return false;
      },
    },
  });

  useEffect(() => {
    if (statusData) {
      if (statusData.status === "paid") setPaymentStatus("paid");
      else if (statusData.status === "failed") setPaymentStatus("failed");
    }
  }, [statusData]);

  const handlePay = async () => {
    if (!selectedPackage || !phone) return;
    const pkg = packages.find((p) => p.id === selectedPackage);
    if (!pkg) return;
    try {
      setPaymentStatus("pending");
      setPhoneModalOpen(false);
      const session = await createSession.mutateAsync({
        data: { phone, packageId: pkg.id, ipAddress: clientIp },
      });
      const payRes = await initiatePayment.mutateAsync({
        data: { sessionId: session.id, phone, amount: pkg.price },
      });
      if (payRes.reference) setPaymentRef(payRes.reference);
      else setPaymentStatus("failed");
    } catch {
      setPaymentStatus("failed");
    }
  };

  const handlePhoneLogin = async () => {
    if (!loginPhone || !clientIp) return;
    setLoginStatus("loading");
    setLoginError("");
    try {
      await phoneLogin.mutateAsync({ data: { phone: loginPhone, ipAddress: clientIp } });
      setLoginStatus("success");
    } catch (err: any) {
      setLoginStatus("error");
      setLoginError(
        err?.response?.status === 404
          ? "No active plan found for this number. Please buy a package first."
          : "Something went wrong. Please try again."
      );
    }
  };

  // ── Success screens ───────────────────────────────────────
  if (paymentStatus === "paid" || loginStatus === "success") {
    return (
      <div className="min-h-[100dvh] bg-[#f0fdf4] flex flex-col items-center justify-center p-6">
        <div className="bg-white p-8 rounded-3xl shadow-sm text-center max-w-sm w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-3xl font-extrabold text-green-900 mb-2">Connected!</h1>
          <p className="text-green-700 mb-8">
            {loginStatus === "success"
              ? "Your session is active. Internet access will be unblocked in a few seconds."
              : "Your internet package is active. Enjoy browsing at high speeds."}
          </p>
          <Button
            onClick={() => window.location.reload()}
            size="lg"
            className="bg-green-600 hover:bg-green-700 text-white w-full rounded-2xl h-14 text-lg shadow-lg shadow-green-600/20"
          >
            Browse Now
          </Button>
        </div>
      </div>
    );
  }

  if (paymentStatus === "pending") {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center p-6 text-center">
        <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mb-8 relative">
          <div className="absolute inset-0 border-4 border-primary/20 rounded-full animate-ping"></div>
          <Spinner size="lg" className="text-primary w-10 h-10" />
        </div>
        <h1 className="text-3xl font-bold mb-3 tracking-tight">Check your phone</h1>
        <p className="text-muted-foreground text-lg max-w-xs mx-auto mb-8">
          We've sent an M-Pesa prompt to{" "}
          <span className="font-bold text-foreground">{phone}</span>. Enter your PIN to complete.
        </p>
        <p className="text-sm text-muted-foreground bg-muted px-4 py-2 rounded-full">
          Waiting for payment confirmation...
        </p>
      </div>
    );
  }

  // ── Main portal ───────────────────────────────────────────
  return (
    <div className="min-h-[100dvh] bg-background">
      {/* Header */}
      <div className="bg-primary text-primary-foreground px-6 py-12 rounded-b-[2.5rem] shadow-lg mb-8 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-10 pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(circle at 2px 2px, white 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
        ></div>
        <div className="max-w-md mx-auto relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md">
              <Wifi className="w-6 h-6" />
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight">FastNet Hotspot</h1>
          </div>
          <p className="text-primary-foreground/90 text-lg">
            High-speed internet. Select a package to connect instantly via M-Pesa.
          </p>
        </div>
      </div>

      <div className="max-w-md mx-auto px-6 pb-16 space-y-6">
        {/* Already have a plan? */}
        <button
          onClick={() => { setLoginPhone(""); setLoginStatus("idle"); setLoginError(""); setLoginModalOpen(true); }}
          className="w-full flex items-center gap-3 p-4 rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 hover:border-primary/50 transition-all text-left"
        >
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Phone className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="font-bold text-primary">Already have a plan?</p>
            <p className="text-sm text-muted-foreground">Login with your phone number to connect</p>
          </div>
        </button>

        {/* Packages */}
        <div>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            Buy a Package
            <span className="bg-primary/10 text-primary text-xs px-2 py-1 rounded-full font-semibold">
              Fast &amp; Reliable
            </span>
          </h2>

          {paymentStatus === "failed" && (
            <Alert variant="destructive" className="mb-4 rounded-2xl border-destructive/20 bg-destructive/10">
              <AlertCircle className="h-5 w-5" />
              <AlertTitle className="text-lg">Payment Failed</AlertTitle>
              <AlertDescription>
                We couldn't process your payment. Please ensure you have sufficient funds and try again.
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4">
            {isLoadingPackages
              ? Array(3)
                  .fill(0)
                  .map((_, i) => (
                    <Card key={i} className="rounded-3xl border-border/50 animate-pulse bg-muted/50">
                      <CardContent className="h-28"></CardContent>
                    </Card>
                  ))
              : packages
                  .filter((p) => p.isActive !== false)
                  .map((pkg) => (
                    <Card
                      key={pkg.id}
                      className="rounded-3xl border-2 border-border/50 hover:border-primary/50 transition-all duration-200 cursor-pointer overflow-hidden shadow-sm hover:shadow-md hover:shadow-primary/5 group"
                      onClick={() => {
                        setSelectedPackage(pkg.id);
                        setPhoneModalOpen(true);
                      }}
                    >
                      <CardContent className="p-0">
                        <div className="flex items-center justify-between p-5 relative">
                          <div className="absolute right-0 top-0 w-32 h-32 bg-primary/5 rounded-bl-[100px] -z-10 group-hover:bg-primary/10 transition-colors"></div>
                          <div>
                            <h3 className="font-extrabold text-xl mb-1">{pkg.name}</h3>
                            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                              <span className="bg-muted px-2 py-1 rounded-md text-foreground/80">
                                {pkg.durationHours} Hours
                              </span>
                              <span>•</span>
                              <span className="bg-muted px-2 py-1 rounded-md text-foreground/80">
                                {pkg.dataLimitMb === 0 ? "Unlimited" : `${pkg.dataLimitMb} MB`}
                              </span>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-bold text-muted-foreground tracking-wider uppercase">KES</span>
                            <p className="text-3xl font-extrabold text-primary leading-none mt-1">{pkg.price}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
          </div>
        </div>
      </div>

      {/* ── Buy: M-Pesa modal ─────────────────────────────── */}
      <Dialog open={phoneModalOpen} onOpenChange={setPhoneModalOpen}>
        <DialogContent className="sm:max-w-[400px] rounded-[2rem] p-6">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-2xl font-bold">M-Pesa Payment</DialogTitle>
            <DialogDescription className="text-base mt-2">
              Enter your Safaricom number. We will send an STK push to your phone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="phone" className="mb-3 block font-semibold text-muted-foreground uppercase tracking-wider text-xs">
              Phone Number
            </Label>
            <Input
              id="phone"
              placeholder="0712 345 678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="text-2xl py-7 px-5 rounded-2xl font-semibold tracking-wide border-2 bg-muted/30 focus-visible:ring-0 focus-visible:border-primary transition-colors"
              type="tel"
            />
          </div>
          <Button
            className="w-full rounded-2xl h-14 text-lg font-bold shadow-lg shadow-primary/20"
            onClick={handlePay}
            disabled={!phone || createSession.isPending || initiatePayment.isPending}
          >
            {createSession.isPending || initiatePayment.isPending ? (
              <Spinner className="text-primary-foreground mr-2" />
            ) : null}
            Pay KES {packages.find((p) => p.id === selectedPackage)?.price}
          </Button>
        </DialogContent>
      </Dialog>

      {/* ── Login with phone modal ────────────────────────── */}
      <Dialog open={loginModalOpen} onOpenChange={setLoginModalOpen}>
        <DialogContent className="sm:max-w-[400px] rounded-[2rem] p-6">
          <DialogHeader className="mb-2">
            <DialogTitle className="text-2xl font-bold">Login with Phone</DialogTitle>
            <DialogDescription className="text-base mt-2">
              Enter the phone number used when your plan was activated. Your device will be connected instantly.
            </DialogDescription>
          </DialogHeader>

          {loginStatus === "error" && (
            <Alert variant="destructive" className="rounded-2xl border-destructive/20 bg-destructive/10 mt-2">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{loginError}</AlertDescription>
            </Alert>
          )}

          <div className="py-4">
            <Label htmlFor="login-phone" className="mb-3 block font-semibold text-muted-foreground uppercase tracking-wider text-xs">
              Phone Number
            </Label>
            <Input
              id="login-phone"
              placeholder="0712 345 678"
              value={loginPhone}
              onChange={(e) => setLoginPhone(e.target.value)}
              className="text-2xl py-7 px-5 rounded-2xl font-semibold tracking-wide border-2 bg-muted/30 focus-visible:ring-0 focus-visible:border-primary transition-colors"
              type="tel"
              onKeyDown={(e) => e.key === "Enter" && handlePhoneLogin()}
            />
            {!clientIp && (
              <p className="text-xs text-orange-600 mt-2">
                IP not detected — make sure you were redirected from the hotspot.
              </p>
            )}
          </div>
          <Button
            className="w-full rounded-2xl h-14 text-lg font-bold shadow-lg shadow-primary/20"
            onClick={handlePhoneLogin}
            disabled={!loginPhone || !clientIp || loginStatus === "loading"}
          >
            {loginStatus === "loading" ? <Spinner className="text-primary-foreground mr-2" /> : <Phone className="mr-2 h-5 w-5" />}
            {loginStatus === "loading" ? "Connecting..." : "Connect Now"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
