import { useState } from "react";
import { Download } from "lucide-react";
import { downloadFile } from "../lib/clientApi";
import { Button } from "./ui";

export default function ExportButton({ type, params, label = "Exporter Excel", variant = "secondary", size = "md", onError }) {
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      const clean = {};
      Object.entries(params || {}).forEach(([k, v]) => {
        if (v !== "" && v !== false && v !== null && v !== undefined) clean[k] = v === true ? "1" : v;
      });
      await downloadFile(`/api/exports/${type}`, { params: clean, fallbackName: `${type}.xlsx` });
    } catch (err) {
      if (onError) onError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button variant={variant} size={size} icon={Download} loading={busy} onClick={run}>
      {label}
    </Button>
  );
}
