"use client";

import { useRef, useState } from "react";
import { Button } from "@/shared/components";
import { getProviderCustomModelRows } from "@/shared/utils/providerCustomModels";
function CompatibleModelRow({ modelId, fullModel, copied, onCopy, onDeleteAlias, onTest, testStatus, isTesting, onDisable }) {
  const borderColor = testStatus === "ok"
    ? "border-green-500/40"
    : testStatus === "error"
    ? "border-red-500/40"
    : "border-border";

  const iconColor = testStatus === "ok"
    ? "#22c55e"
    : testStatus === "error"
    ? "#ef4444"
    : undefined;

  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border ${borderColor} hover:bg-sidebar/50`}>
      <span
        className="material-symbols-outlined text-base text-text-muted"
        style={iconColor ? { color: iconColor } : undefined}
      >
        {testStatus === "ok" ? "check_circle" : testStatus === "error" ? "cancel" : "smart_toy"}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{modelId}</p>
        <div className="flex items-center gap-1 mt-1">
          <code className="text-xs text-text-muted font-mono bg-sidebar px-1.5 py-0.5 rounded">{fullModel}</code>
          <div className="relative group/btn">
            <button
              onClick={() => onCopy(fullModel, `model-${modelId}`)}
              className="p-0.5 hover:bg-sidebar rounded text-text-muted hover:text-primary"
            >
              <span className="material-symbols-outlined text-sm">
                {copied === `model-${modelId}` ? "check" : "content_copy"}
              </span>
            </button>
            <span className="pointer-events-none absolute top-5 left-1/2 -translate-x-1/2 text-[10px] text-text-muted whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity">
              {copied === `model-${modelId}` ? "Copied!" : "Copy"}
            </span>
          </div>
          {onTest && (
            <div className="relative group/btn">
              <button
                onClick={onTest}
                disabled={isTesting}
                className="p-0.5 hover:bg-sidebar rounded text-text-muted hover:text-primary transition-colors"
              >
                <span className="material-symbols-outlined text-sm" style={isTesting ? { animation: "spin 1s linear infinite" } : undefined}>
                  {isTesting ? "progress_activity" : "science"}
                </span>
              </button>
              <span className="pointer-events-none absolute top-5 left-1/2 -translate-x-1/2 text-[10px] text-text-muted whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity">
                {isTesting ? "Testing..." : "Test"}
              </span>
            </div>
          )}
        </div>
      </div>
      {onDisable && (
        <button
          onClick={onDisable}
          className="p-1 hover:bg-sidebar rounded text-text-muted"
          title="Disable model"
        >
          <span className="material-symbols-outlined text-sm">visibility_off</span>
        </button>
      )}
      <button
        onClick={onDeleteAlias}
        className="p-1 hover:bg-red-50 rounded text-red-500"
        title="Remove model"
      >
        <span className="material-symbols-outlined text-sm">delete</span>
      </button>
    </div>
  );
}

export default function CompatibleModelsSection({ providerStorageAlias, providerDisplayAlias, modelAliases, customModels, copied, onCopy, onDeleteAlias, onAddCustomModel, onDeleteCustomModel, onDisableModel, onEnableModel, disabledModelIds, connections, isAnthropic }) {
  const [newModel, setNewModel] = useState("");
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [testingModelId, setTestingModelId] = useState(null);
  const [modelTestResults, setModelTestResults] = useState({});
  const [batchTesting, setBatchTesting] = useState(false);
  const [batchProgress, setBatchProgress] = useState(null);
  const [autoDisableFailed, setAutoDisableFailed] = useState(false);
  const stopBatchRef = useRef(false);

  const handleTestModel = async (modelId) => {
    if (testingModelId || batchTesting) return;
    setTestingModelId(modelId);
    try {
      const res = await fetch("/api/models/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: `${providerStorageAlias}/${modelId}` }),
      });
      const data = await res.json();
      setModelTestResults((prev) => ({ ...prev, [modelId]: data.ok ? "ok" : "error" }));
    } catch {
      setModelTestResults((prev) => ({ ...prev, [modelId]: "error" }));
    } finally {
      setTestingModelId(null);
    }
  };

  const allModels = getProviderCustomModelRows({
    customModels,
    modelAliases,
    providerAlias: providerStorageAlias,
    type: "llm",
  });
  const disabledSet = new Set(disabledModelIds || []);
  const activeModels = allModels.filter((m) => !disabledSet.has(m.id));
  const disabledModels = allModels.filter((m) => disabledSet.has(m.id));

  const handleAdd = async () => {
    if (!newModel.trim() || adding) return;
    const modelId = newModel.trim();
    if (allModels.some((model) => model.id === modelId)) {
      alert("Model already exists for this provider.");
      return;
    }

    setAdding(true);
    try {
      await onAddCustomModel(modelId);
      setNewModel("");
    } catch (error) {
      console.log("Error adding model:", error);
    } finally {
      setAdding(false);
    }
  };

  const handleImport = async () => {
    if (importing) return;
    const activeConnection = connections.find((conn) => conn.isActive !== false);
    if (!activeConnection) return;

    setImporting(true);
    try {
      const res = await fetch(`/api/providers/${activeConnection.id}/models`);
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to import models");
        return;
      }
      const models = data.models || [];
      if (models.length === 0) {
        alert("No models returned from /models.");
        return;
      }
      let importedCount = 0;
      for (const model of models) {
        const modelId = model.id || model.name || model.model;
        if (!modelId) continue;
        if (allModels.some((entry) => entry.id === modelId)) continue;
        await onAddCustomModel(modelId);
        importedCount += 1;
      }
      if (importedCount === 0) {
        alert("No new models were added.");
      }
    } catch (error) {
      console.log("Error importing models:", error);
    } finally {
      setImporting(false);
    }
  };

  const handleBatchTest = async () => {
    if (batchTesting || activeModels.length === 0) return;
    stopBatchRef.current = false;
    setBatchTesting(true);
    setBatchProgress({ done: 0, total: activeModels.length, ok: 0, failed: 0 });
    let ok = 0;
    let failed = 0;
    for (let i = 0; i < activeModels.length; i++) {
      if (stopBatchRef.current) break;
      const { id } = activeModels[i];
      try {
        const res = await fetch("/api/models/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: `${providerStorageAlias}/${id}` }),
        });
        const data = await res.json();
        if (data.ok) ok += 1;
        else {
          failed += 1;
          if (autoDisableFailed && onDisableModel) await onDisableModel(id);
        }
        setModelTestResults((prev) => ({ ...prev, [id]: data.ok ? "ok" : "error" }));
      } catch {
        failed += 1;
        if (autoDisableFailed && onDisableModel) await onDisableModel(id);
        setModelTestResults((prev) => ({ ...prev, [id]: "error" }));
      }
      setBatchProgress({ done: i + 1, total: activeModels.length, ok, failed });
    }
    setBatchTesting(false);
  };

  const canImport = connections.some((conn) => conn.isActive !== false);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-text-muted">
        Add {isAnthropic ? "Anthropic" : "OpenAI"}-compatible models manually or import them from the /models endpoint.
      </p>

      <div className="flex items-end gap-2 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <label htmlFor="new-compatible-model-input" className="text-xs text-text-muted mb-1 block">Model ID</label>
          <input
            id="new-compatible-model-input"
            type="text"
            value={newModel}
            onChange={(e) => setNewModel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder={isAnthropic ? "claude-3-opus-20240229" : "gpt-4o"}
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:border-primary"
          />
        </div>
        <Button size="sm" icon="add" onClick={handleAdd} disabled={!newModel.trim() || adding}>
          {adding ? "Adding..." : "Add"}
        </Button>
        <Button size="sm" variant="secondary" icon="download" onClick={handleImport} disabled={!canImport || importing}>
          {importing ? "Importing..." : "Import from /models"}
        </Button>
        {allModels.length > 0 && (
          <Button
            size="sm"
            variant="secondary"
            icon={batchTesting ? "stop" : "science"}
            loading={batchTesting}
            onClick={batchTesting ? () => { stopBatchRef.current = true; } : handleBatchTest}
          >
            {batchTesting ? "Stop" : "Test All Models"}
          </Button>
        )}
        {/* ponytail: batch test hits every model including disabled ones; skip them once restore flow needs it */}
        {batchTesting && batchProgress && (
          <span className="text-xs text-text-muted pb-1.5">
            {batchProgress.done}/{batchProgress.total} — {batchProgress.ok} ok, {batchProgress.failed} error
          </span>
        )}
        {activeModels.length > 0 && onDisableModel && (
          <label className="flex items-center gap-1.5 text-xs text-text-muted cursor-pointer pb-1.5 whitespace-nowrap">
            <input
              type="checkbox"
              checked={autoDisableFailed}
              onChange={(e) => setAutoDisableFailed(e.target.checked)}
              className="accent-[var(--color-primary)]"
            />
            Auto-disable failed
          </label>
        )}
      </div>

      {!canImport && (
        <p className="text-xs text-text-muted">
          Add a connection to enable importing models.
        </p>
      )}

      {activeModels.length > 0 && (
        <div className="flex flex-col gap-3">
          {activeModels.map(({ id, alias, source }) => (
            <CompatibleModelRow
              key={`${source}-${providerStorageAlias}/${id}`}
              modelId={id}
              fullModel={`${providerDisplayAlias}/${id}`}
              copied={copied}
              onCopy={onCopy}
              onDeleteAlias={() => source === "custom" ? onDeleteCustomModel(id) : onDeleteAlias(alias)}
              onTest={connections.length > 0 ? () => handleTestModel(id) : undefined}
              testStatus={modelTestResults[id]}
              isTesting={testingModelId === id}
              onDisable={onDisableModel ? () => onDisableModel(id) : undefined}
            />
          ))}
        </div>
      )}

      {disabledModels.length > 0 && (
        <div className="w-full mt-2">
          <p className="text-xs text-text-muted mb-2">Disabled models ({disabledModels.length}):</p>
          <div className="flex flex-wrap gap-2">
            {disabledModels.map(({ id }) => (
              <button
                key={id}
                onClick={() => onEnableModel(id)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-dashed border-black/10 dark:border-white/10 text-xs text-text-muted hover:text-primary hover:border-primary/40 hover:bg-primary/5 transition-colors"
                title="Restore model"
              >
                <span className="material-symbols-outlined text-[13px]">add</span>
                {id}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

