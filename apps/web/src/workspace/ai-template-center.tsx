import type { AiTemplate, ProjectTemplate } from '@hotelcut/schemas';
import { useEffect, useState, type FormEvent } from 'react';

import type { WorkspaceApi } from './workspace-api';

interface AiTemplateCenterProps {
  api: WorkspaceApi;
  hotelId: string;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; templates: ProjectTemplate[]; aiTemplates: AiTemplate[] }
  | { status: 'error'; message: string };

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : '模板中心加载失败';
}

export function AiTemplateCenter({ api, hotelId }: AiTemplateCenterProps) {
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
  const [loadVersion, setLoadVersion] = useState(0);
  const [name, setName] = useState('');
  const [objective, setObjective] = useState('');
  const [durationSeconds, setDurationSeconds] = useState(20);
  const [generating, setGenerating] = useState(false);
  const [selectedAiTemplateIds, setSelectedAiTemplateIds] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoadState({ status: 'loading' });
    void Promise.all([
      api.listProjectTemplates(controller.signal),
      api.listAiTemplates(hotelId, controller.signal),
    ])
      .then(([templates, aiTemplates]) => setLoadState({ templates, aiTemplates, status: 'ready' }))
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) {
          setLoadState({ message: formatError(loadError), status: 'error' });
        }
      });
    return () => controller.abort();
  }, [api, hotelId, loadVersion]);

  const generate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setGenerating(true);
    setError(null);
    setMessage(null);
    try {
      const template = await api.generateAiTemplate(hotelId, {
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(objective.trim() ? { objective: objective.trim() } : {}),
        durationSeconds,
      });
      setName('');
      setObjective('');
      setMessage(`已生成模板「${template.name}」，可直接在视频项目中使用。`);
      setLoadVersion((version) => version + 1);
    } catch (generateError) {
      setError(formatError(generateError));
    } finally {
      setGenerating(false);
    }
  };

  const remove = async (template: AiTemplate) => {
    setError(null);
    setMessage(null);
    try {
      await api.deleteAiTemplate(hotelId, template.id);
      setMessage(`已删除模板「${template.name}」。`);
      setLoadVersion((version) => version + 1);
    } catch (deleteError) {
      setError(formatError(deleteError));
    }
  };

  const deleteSelected = async () => {
    if (selectedAiTemplateIds.length === 0) {
      return;
    }
    if (
      !window.confirm(`确定删除选中的 ${selectedAiTemplateIds.length} 个模板？删除后不可恢复。`)
    ) {
      return;
    }
    setError(null);
    setMessage(null);
    try {
      await api.deleteAiTemplates(hotelId, selectedAiTemplateIds);
      setMessage(`已删除 ${selectedAiTemplateIds.length} 个模板`);
      setSelectedAiTemplateIds([]);
      setLoadVersion((version) => version + 1);
    } catch (deleteError) {
      setError(formatError(deleteError));
    }
  };

  return (
    <section aria-label="AI 模板中心" className="template-center-page">
      <div className="page-heading-row">
        <div>
          <p className="page-eyebrow">AI TEMPLATE CENTER</p>
          <h2>模板中心</h2>
          <p>让 AI 根据已分析素材生成专属剪辑模板，也可以继续使用内置模板。</p>
        </div>
      </div>

      <form
        className="template-generate-card surface-card"
        onSubmit={(event) => void generate(event)}
      >
        <div>
          <p className="text-sm font-black">用 AI 分析生成模板</p>
          <p className="mt-1 text-[10px] leading-5 text-slate-500">
            系统会读取本酒店已分析素材的标签、卖点和画面描述，生成按时间轴分镜的剪辑模板。
          </p>
        </div>
        <label className="editor-field">
          <span>模板名称（可选）</span>
          <input
            maxLength={160}
            onChange={(event) => setName(event.target.value)}
            placeholder="例如：湖景周末礼遇"
            value={name}
          />
        </label>
        <label className="editor-field">
          <span>创作目标（可选）</span>
          <input
            maxLength={500}
            onChange={(event) => setObjective(event.target.value)}
            placeholder="例如：突出湖景与周末优惠"
            value={objective}
          />
        </label>
        <label className="editor-field">
          <span>成片时长（秒）</span>
          <select
            onChange={(event) => setDurationSeconds(Number(event.target.value))}
            value={durationSeconds}
          >
            {[15, 20, 25, 30].map((seconds) => (
              <option key={seconds} value={seconds}>
                {seconds} 秒
              </option>
            ))}
          </select>
        </label>
        <button className="editor-primary-button" disabled={generating} type="submit">
          {generating ? '正在生成…' : '用 AI 分析生成模板'}
        </button>
        {message ? (
          <p className="rounded-xl bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-700">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="rounded-xl bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">{error}</p>
        ) : null}
      </form>

      {loadState.status === 'loading' ? (
        <p className="text-xs font-semibold text-slate-500">正在加载模板…</p>
      ) : null}
      {loadState.status === 'error' ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <p className="text-xs font-semibold text-rose-700">{loadState.message}</p>
        </div>
      ) : null}
      {loadState.status === 'ready' ? (
        <div className="mt-6 grid gap-5 xl:grid-cols-2">
          <section className="surface-card p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black">AI 生成模板</h3>
              <div className="flex items-center gap-2">
                {selectedAiTemplateIds.length > 0 ? (
                  <button
                    className="editor-secondary-button"
                    onClick={() => void deleteSelected()}
                    type="button"
                  >
                    删除选中（{selectedAiTemplateIds.length}）
                  </button>
                ) : null}
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black text-amber-700">
                  {loadState.aiTemplates.length}
                </span>
              </div>
            </div>
            {loadState.aiTemplates.length === 0 ? (
              <p className="mt-4 rounded-xl bg-slate-50 p-4 text-[10px] leading-5 text-slate-500">
                还没有 AI 模板。先确保素材库有已分析完成的素材，再点击上方按钮生成。
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {loadState.aiTemplates.map((template) => (
                  <article
                    className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4"
                    key={template.id}
                  >
                    <div className="flex items-start gap-3">
                      <label className="mt-0.5 flex items-center gap-2 text-[10px] font-bold text-slate-600">
                        <input
                          aria-label={`选择模板 ${template.name}`}
                          checked={selectedAiTemplateIds.includes(template.id)}
                          onChange={(event) =>
                            setSelectedAiTemplateIds((current) =>
                              event.target.checked
                                ? [...current, template.id]
                                : current.filter((id) => id !== template.id),
                            )
                          }
                          type="checkbox"
                        />
                      </label>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-black">{template.name}</p>
                        <p className="mt-1 text-[10px] text-slate-500">
                          {template.durationSeconds} 秒 · {template.spec.beats.length} 个分镜
                        </p>
                      </div>
                      <button
                        className="editor-secondary-button"
                        onClick={() => void remove(template)}
                        type="button"
                      >
                        删除
                      </button>
                    </div>
                    <p className="mt-2 text-[10px] leading-5 text-slate-600">
                      {template.description}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="surface-card p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black">内置模板</h3>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600">
                {loadState.templates.length}
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {loadState.templates.map((template) => (
                <article
                  className="rounded-2xl border border-slate-100 bg-white p-4"
                  key={template.key}
                >
                  <p className="text-xs font-black">{template.name}</p>
                  <p className="mt-1 text-[10px] leading-5 text-slate-500">
                    {template.description}
                  </p>
                  <p className="mt-2 text-[10px] font-bold text-[#9a6b3c]">
                    {template.minDurationSeconds}–{template.maxDurationSeconds} 秒 · 需要标签：
                    {template.requiredTags.join('、')}
                  </p>
                </article>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
