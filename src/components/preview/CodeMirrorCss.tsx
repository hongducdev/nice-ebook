import CodeMirror from "@uiw/react-codemirror";
import { css } from "@codemirror/lang-css";
import { Copy, RefreshCw, Check } from "lucide-react";
import { useState } from "react";
import { useAppStore } from "../../stores/useAppStore";
import { toast } from "sonner";
import { Button } from "../ui/button";

export function CodeMirrorCss() {
  const { customCss, updateTypography, activePreset } = useAppStore();
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(customCss);
    setCopied(true);
    toast.success("Đã copy toàn bộ mã CSS vào clipboard");
    setTimeout(() => setCopied(false), 2000);
  }

  function handleReset() {
    updateTypography({ customCss: activePreset.cssTemplate });
    toast.info("Đã khôi phục CSS về template gốc");
  }

  return (
    <div className="flex-1 flex flex-col bg-card border border-border rounded-2xl overflow-hidden shadow-xl select-none">
      {/* Editor Toolbar */}
      <div className="h-10 px-4 border-b border-border bg-muted/30 flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-primary" />
          <span className="font-semibold text-foreground">Biên Tập CSS Trực Tiếp (CodeMirror 6)</span>
          <span className="text-xs font-mono text-muted-foreground">style.css</span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            className="h-7 text-xs px-2.5 gap-1 text-muted-foreground hover:text-foreground"
            title="Khôi phục về mẫu gốc"
          >
            <RefreshCw className="size-3" />
            <span>Reset</span>
          </Button>
          <Button
            size="sm"
            onClick={handleCopy}
            className="h-7 text-xs px-2.5 gap-1 font-medium"
          >
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
            <span>{copied ? "Đã chép" : "Copy CSS"}</span>
          </Button>
        </div>
      </div>

      {/* CodeMirror Editor Area */}
      <div className="flex-1 overflow-auto text-xs font-mono">
        <CodeMirror
          value={customCss}
          height="100%"
          extensions={[css()]}
          theme="dark"
          onChange={(val) => updateTypography({ customCss: val })}
          className="h-full"
          basicSetup={{
            lineNumbers: true,
            foldGutter: true,
            dropCursor: false,
            allowMultipleSelections: false,
            indentOnInput: true,
          }}
        />
      </div>
    </div>
  );
}
