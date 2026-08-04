import type {
  ModelProviderConnectionResult,
  ModelProviderSettings,
  UpsertModelProviderSettingsInput,
} from '@hotelcut/schemas';
import { CheckCircle2, KeyRound, LoaderCircle, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';

import type { WorkspaceApi } from './workspace-api';

interface ModelApiSettingsProps {
  api: WorkspaceApi;
  hotelId: string;
}

interface SettingsDraft {
  apiKey: string;
  apiMode: UpsertModelProviderSettingsInput['apiMode'];
  baseUrl: string;
  enabled: boolean;
  model: string;
  provider: UpsertModelProviderSettingsInput['provider'];
  reasoningEffort: UpsertModelProviderSettingsInput['reasoningEffort'];
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; settings: ModelProviderSettings }
  | { status: 'error'; message: string };

type ActionState =
  | { status: 'idle' }
  | { status: 'saving' | 'testing' }
  | { status: 'saved'; message: string }
  | { status: 'tested'; result: ModelProviderConnectionResult }
  | { status: 'error'; message: string };

function draftFrom(settings: ModelProviderSettings): SettingsDraft {
  return {
    apiKey: '',
    apiMode: settings.apiMode,
    baseUrl: settings.baseUrl,
    enabled: settings.enabled,
    model: settings.model,
    provider: settings.provider,
    reasoningEffort: settings.reasoningEffort,
  };
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : '模型配置请求失败';
}

export function ModelApiSettings({ api, hotelId }: ModelApiSettingsProps) {
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const [actionState, setActionState] = useState<ActionState>({ status: 'idle' });

  useEffect(() => {
    const controller = new AbortController();
    setLoadState({ status: 'loading' });
    void api
      .getModelProviderSettings(hotelId, controller.signal)
      .then((settings) => {
        setDraft(draftFrom(settings));
        setLoadState({ settings, status: 'ready' });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setLoadState({ message: formatError(error), status: 'error' });
        }
      });
    return () => controller.abort();
  }, [api, hotelId]);

  const payload = (): UpsertModelProviderSettingsInput => {
    if (!draft) throw new Error('模型配置尚未加载');
    return {
      provider: draft.provider,
      baseUrl: draft.baseUrl.trim().replace(/\/+$/, ''),
      apiMode: draft.apiMode,
      model: draft.model.trim(),
      reasoningEffort: draft.reasoningEffort,
      enabled: draft.enabled,
      ...(draft.apiKey.trim() ? { apiKey: draft.apiKey.trim() } : {}),
    };
  };

  const persist = async (): Promise<ModelProviderSettings> => {
    const settings = await api.saveModelProviderSettings(hotelId, payload());
    setDraft(draftFrom(settings));
    setLoadState({ settings, status: 'ready' });
    return settings;
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setActionState({ status: 'saving' });
    try {
      const settings = await persist();
      setActionState({
        message: settings.apiKeyConfigured
          ? '模型配置已安全保存。'
          : '基础配置已保存；启用前还需要填写 API Key。',
        status: 'saved',
      });
    } catch (error) {
      setActionState({ message: formatError(error), status: 'error' });
    }
  };

  const testConnection = async () => {
    setActionState({ status: 'testing' });
    try {
      await persist();
      const result = await api.testModelProvider(hotelId);
      setActionState({ result, status: 'tested' });
    } catch (error) {
      setActionState({ message: formatError(error), status: 'error' });
    }
  };

  if (loadState.status === 'loading' || !draft) {
    return (
      <section className="surface-card p-8">
        <p className="text-sm font-semibold text-slate-500">正在读取模型配置…</p>
      </section>
    );
  }

  if (loadState.status === 'error') {
    return (
      <section className="surface-card border-rose-200 bg-rose-50 p-8">
        <h2 className="text-base font-black text-rose-800">模型配置加载失败</h2>
        <p className="mt-2 text-sm text-rose-700">{loadState.message}</p>
      </section>
    );
  }

  const busy = actionState.status === 'saving' || actionState.status === 'testing';
  const configured = loadState.settings.apiKeyConfigured;

  return (
    <section aria-label="大模型 API 配置" className="model-settings-page">
      <div className="page-heading-row">
        <div>
          <p className="page-eyebrow">MODEL INTELLIGENCE</p>
          <h2>大模型 API 配置</h2>
          <p>
            配置自动剪辑策划使用的模型服务。保存后可立即测试，并在 AI 成片向导中生成真实策划方案。
          </p>
        </div>
        <span className={`model-config-status ${configured ? 'is-ready' : ''}`}>
          {configured ? <CheckCircle2 size={15} /> : <TriangleAlert size={15} />}
          {configured ? '密钥已配置' : '等待 API Key'}
        </span>
      </div>

      <form className="model-settings-grid" onSubmit={(event) => void save(event)}>
        <div className="surface-card model-settings-form">
          <div className="model-settings-title">
            <span>
              <KeyRound size={18} />
            </span>
            <div>
              <h3>模型服务</h3>
              <p>支持 OpenAI Responses API，也支持兼容 Chat Completions 的服务。</p>
            </div>
          </div>

          <div className="model-form-fields">
            <label className="editor-field">
              <span>服务类型</span>
              <select
                aria-label="服务类型"
                onChange={(event) => {
                  const provider = event.target.value as SettingsDraft['provider'];
                  setDraft((current) =>
                    current
                      ? {
                          ...current,
                          provider,
                          ...(provider === 'openai'
                            ? { baseUrl: 'https://api.openai.com/v1', apiMode: 'responses' }
                            : {}),
                        }
                      : current,
                  );
                  setActionState({ status: 'idle' });
                }}
                value={draft.provider}
              >
                <option value="openai">OpenAI</option>
                <option value="openai-compatible">OpenAI 兼容服务</option>
              </select>
            </label>

            <label className="editor-field">
              <span>调用协议</span>
              <select
                aria-label="调用协议"
                onChange={(event) => {
                  setDraft((current) =>
                    current
                      ? {
                          ...current,
                          apiMode: event.target.value as SettingsDraft['apiMode'],
                        }
                      : current,
                  );
                  setActionState({ status: 'idle' });
                }}
                value={draft.apiMode}
              >
                <option value="responses">Responses API（推荐）</option>
                <option value="chat_completions">Chat Completions</option>
              </select>
            </label>

            <label className="editor-field model-field-wide">
              <span>API Base URL</span>
              <input
                aria-label="API Base URL"
                onChange={(event) => {
                  setDraft((current) =>
                    current ? { ...current, baseUrl: event.target.value } : current,
                  );
                  setActionState({ status: 'idle' });
                }}
                placeholder="https://api.openai.com/v1"
                required
                type="url"
                value={draft.baseUrl}
              />
            </label>

            <label className="editor-field">
              <span>模型</span>
              <input
                aria-label="模型"
                maxLength={120}
                onChange={(event) => {
                  setDraft((current) =>
                    current ? { ...current, model: event.target.value } : current,
                  );
                  setActionState({ status: 'idle' });
                }}
                placeholder="gpt-5.6"
                required
                value={draft.model}
              />
            </label>

            <label className="editor-field">
              <span>推理强度</span>
              <select
                aria-label="推理强度"
                onChange={(event) => {
                  setDraft((current) =>
                    current
                      ? {
                          ...current,
                          reasoningEffort: event.target.value as SettingsDraft['reasoningEffort'],
                        }
                      : current,
                  );
                  setActionState({ status: 'idle' });
                }}
                value={draft.reasoningEffort}
              >
                <option value="none">无（最低延迟）</option>
                <option value="low">低</option>
                <option value="medium">中（推荐）</option>
                <option value="high">高</option>
                <option value="xhigh">超高</option>
                <option value="max">最大</option>
              </select>
            </label>

            <label className="editor-field model-field-wide">
              <span>API Key</span>
              <input
                aria-label="API Key"
                autoComplete="off"
                onChange={(event) => {
                  setDraft((current) =>
                    current ? { ...current, apiKey: event.target.value } : current,
                  );
                  setActionState({ status: 'idle' });
                }}
                placeholder={
                  configured
                    ? `已保存 ${loadState.settings.apiKeyHint ?? '安全密钥'}；留空表示不更换`
                    : '粘贴模型服务的 API Key'
                }
                type="password"
                value={draft.apiKey}
              />
            </label>
          </div>

          <label className="model-enable-row">
            <span>
              <strong>启用 AI 剪辑策划</strong>
              <small>关闭后不会向外部模型服务发送请求。</small>
            </span>
            <input
              aria-label="启用 AI 剪辑策划"
              checked={draft.enabled}
              onChange={(event) => {
                setDraft((current) =>
                  current ? { ...current, enabled: event.target.checked } : current,
                );
                setActionState({ status: 'idle' });
              }}
              type="checkbox"
            />
          </label>

          <div className="model-settings-actions">
            <button className="editor-primary-button" disabled={busy} type="submit">
              {actionState.status === 'saving' ? '正在保存…' : '保存模型配置'}
            </button>
            <button
              className="editor-secondary-button"
              disabled={busy || (!configured && !draft.apiKey.trim())}
              onClick={() => void testConnection()}
              type="button"
            >
              {actionState.status === 'testing' ? (
                <>
                  <LoaderCircle className="animate-spin" size={14} /> 正在测试…
                </>
              ) : (
                '保存并测试真实连接'
              )}
            </button>
          </div>

          {actionState.status === 'saved' ? (
            <p className="model-action-message is-success">{actionState.message}</p>
          ) : null}
          {actionState.status === 'error' ? (
            <p className="model-action-message is-error">{actionState.message}</p>
          ) : null}
          {actionState.status === 'tested' ? (
            <div
              className={`model-test-result ${actionState.result.ok ? 'is-success' : 'is-error'}`}
            >
              {actionState.result.ok ? <CheckCircle2 size={17} /> : <TriangleAlert size={17} />}
              <div>
                <strong>{actionState.result.ok ? '连接成功' : '连接失败'}</strong>
                <p>{actionState.result.message}</p>
                <small>
                  {actionState.result.model}
                  {actionState.result.latencyMs > 0 ? ` · ${actionState.result.latencyMs} ms` : ''}
                </small>
              </div>
            </div>
          ) : null}
        </div>

        <aside className="model-security-card">
          <ShieldCheck size={24} />
          <p className="page-eyebrow">SERVER-SIDE SECRET</p>
          <h3>密钥只保存在服务端</h3>
          <p>
            API Key
            会在服务端加密后写入数据库。浏览器只能看到脱敏提示，接口不会返回完整密钥，也不会把密钥写入项目文件或日志。
          </p>
          <ul>
            <li>连接测试会产生一次极小的真实模型请求，可能产生少量费用。</li>
            <li>AI 策划只发送需求单、模板说明和已分析的素材摘要。</li>
            <li>模型不能编造价格、联系方式或未确认的酒店权益。</li>
          </ul>
        </aside>
      </form>
    </section>
  );
}
