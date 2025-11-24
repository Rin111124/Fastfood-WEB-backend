// Enforces that requests carry a shared secret header when configured.
// Useful to prevent bypassing the gateway (e.g., Kong) in production.
export default function gatewayGuard() {
  const secret = process.env.GATEWAY_SHARED_SECRET;
  const headerName = (process.env.GATEWAY_SHARED_HEADER || "x-gateway-secret").toLowerCase();

  // If not configured, allow all (no-op, suitable for local dev)
  if (!secret) {
    return (req, res, next) => next();
  }

  return (req, res, next) => {
    const provided = req.headers[headerName];
    if (provided && provided === secret) {
      return next();
    }
    return res.status(401).json({ message: "Gateway authentication required" });
  };
}
