import CodeMirror from "@uiw/react-codemirror";
import { css } from "@codemirror/lang-css";
import { Copy, RefreshCw, Check } from "lucide-react";
import { useState } from "react";
import { useAppStore } from "../../stores/useAppStore";
import { toast } from "sonner";

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
    <div className="flex-1 flex flex-col bg-[#141418] border border-[#27272a] rounded-2xl overflow-hidden shadow-xl select-none">
      {/* Editor Toolbar */}
      <div className="h-10 px-4 border-b border-[#27272a] bg-[#101013] flex items-center justify-between text-xs text-[#71717a]">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-indigo-500" />
          <span className="font-semibold text-zinc-300">Biên Tập CSS Trực Tiếp (CodeMirror 6)</span>
          <span className="text-[10px] font-mono text-[#52525b]">style.css</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#18181b] hover:bg-[#222228] text-zinc-400 hover:text-zinc-200 border border-[#27272a] transition-colors text-[11px]"
            title="Khôi phục về mẫu gốc"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Reset</span>
          </button>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors text-[11px]"
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            <span>{copied ? "Đã chép" : "Copy CSS"}</span>
          </button>
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
