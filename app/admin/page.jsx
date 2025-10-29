'use client';

import { useEffect, useMemo, useState } from 'react';

import PageHeader from '../_components/PageHeader';
import { useEditableData } from '../_components/useEditableData';
import { pixilartItems as defaultPixilart } from '../../data/pixilart';
import { artItems as defaultArt } from '../../data/art';
import { typeItems as defaultType } from '../../data/type';
import { workItems as defaultWork } from '../../data/work';
import { profile as defaultProfile } from '../../data/about';

const toDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

function GalleryManager({
  title,
  description,
  dataset,
  fields = ['title', 'caption'],
  showLink = false,
  commitOptions,
}) {
  const [draft, setDraft] = useState(dataset.items);
  const [newItem, setNewItem] = useState({ image: '', title: '', caption: '', href: '' });
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    setDraft(dataset.items);
  }, [dataset.items]);

  const hasChanges = useMemo(() => {
    try {
      return JSON.stringify(draft) !== JSON.stringify(dataset.items);
    } catch (error) {
      return true;
    }
  }, [draft, dataset.items]);

  const updateField = (index, field, value) => {
    setDraft((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    );
  };

  const replaceImage = async (index, file) => {
    try {
      const dataUrl = await toDataUrl(file);
      updateField(index, 'image', dataUrl);
    } catch (error) {
      console.error('failed to read file', error);
    }
  };

  const removeItem = (index) => {
    setDraft((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const moveItem = (index, direction) => {
    setDraft((current) => {
      const next = [...current];
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= current.length) return current;
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  };

  const persistAll = async () => {
    if (!hasChanges || saving) return;
    setSaving(true);
    setFeedback({ type: 'info', message: 'Saving changes...' });
    try {
      const result = await dataset.setItems(draft, commitOptions);
      setFeedback({
        type: 'success',
        message: result?.message || 'Content synced and committed.',
      });
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error?.message || 'Update failed, please try again later.',
      });
    } finally {
      setSaving(false);
    }
  };

  const resetDraft = () => {
    setDraft(dataset.items);
  };

  const resetToDefault = () => {
    dataset.reset();
  };

  const handleNewItemFile = async (file) => {
    try {
      const dataUrl = await toDataUrl(file);
      setNewItem((prev) => ({ ...prev, image: dataUrl }));
    } catch (error) {
      console.error('failed to read file', error);
    }
  };

  const addItem = () => {
    if (!newItem.image) return;
    setDraft((current) => [...current, newItem]);
    setNewItem({ image: '', title: '', caption: '', href: '' });
  };

  return (
    <section className="rounded-3xl border border-soft/60 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 border-b border-soft/40 pb-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-accent">{title}</h2>
          <p className="text-sm text-accent/70">{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <button
            type="button"
            onClick={persistAll}
            disabled={!hasChanges || saving}
            className="rounded-full bg-accent px-4 py-2 font-semibold uppercase tracking-[0.35em] text-white transition disabled:cursor-not-allowed disabled:bg-accent/30"
          >
            {saving ? '同步中…' : '套用變更'}
          </button>
          <button
            type="button"
            onClick={resetDraft}
            className="rounded-full border border-soft px-4 py-2 font-semibold uppercase tracking-[0.35em] text-accent/70 transition hover:bg-soft/60"
          >
            還原草稿
          </button>
          <button
            type="button"
            onClick={resetToDefault}
            className="rounded-full border border-brand/40 px-4 py-2 font-semibold uppercase tracking-[0.35em] text-brand transition hover:bg-brand/10"
          >
            回復預設
          </button>
          {feedback?.message && (
            <span
              className={`text-[0.65rem] font-medium tracking-[0.2em] ${
                feedback.type === 'error'
                  ? 'text-red-500'
                  : feedback.type === 'success'
                  ? 'text-brand'
                  : 'text-accent/50'
              }`}
            >
              {feedback.message}
            </span>
          )}
        </div>
      </div>

      <div className="mt-6 space-y-6">
        {draft.map((item, index) => (
          <div
            key={`${item.image}-${index}`}
            className="grid gap-4 rounded-2xl border border-soft/60 p-4 md:grid-cols-[160px,1fr]"
          >
            <div className="space-y-3">
              {item.image ? (
                <img
                  src={item.image}
                  alt={item.title || `${title} #${index + 1}`}
                  className="aspect-square w-full rounded-xl object-cover"
                />
              ) : (
                <div className="flex aspect-square items-center justify-center rounded-xl border border-dashed border-soft text-xs text-accent/40">
                  尚未設定圖片
                </div>
              )}
              <label className="flex cursor-pointer flex-col gap-2 text-center text-xs font-semibold uppercase tracking-[0.3em] text-accent/70">
                重新上傳
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      replaceImage(index, file);
                      event.target.value = '';
                    }
                  }}
                />
              </label>
            </div>
            <div className="flex flex-col gap-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold uppercase tracking-[0.35em] text-accent/60">
                    圖片連結
                    <input
                      value={item.image || ''}
                      onChange={(event) => updateField(index, 'image', event.target.value)}
                      placeholder="可貼上外部網址或 data:image"
                      className="mt-2 w-full rounded-xl border border-soft px-3 py-2 text-sm text-accent focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/40"
                    />
                  </label>
                </div>
                {fields.includes('title') && (
                  <label className="block text-xs font-semibold uppercase tracking-[0.35em] text-accent/60">
                    標題
                    <input
                      value={item.title || ''}
                      onChange={(event) => updateField(index, 'title', event.target.value)}
                      placeholder="可選填"
                      className="mt-2 w-full rounded-xl border border-soft px-3 py-2 text-sm text-accent focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/40"
                    />
                  </label>
                )}
                {fields.includes('caption') && (
                  <label className="block text-xs font-semibold uppercase tracking-[0.35em] text-accent/60 sm:col-span-2">
                    註解 / 說明
                    <textarea
                      value={item.caption || ''}
                      onChange={(event) => updateField(index, 'caption', event.target.value)}
                      rows={3}
                      className="mt-2 w-full rounded-xl border border-soft px-3 py-2 text-sm text-accent focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/40"
                    />
                  </label>
                )}
                {showLink && (
                  <label className="block text-xs font-semibold uppercase tracking-[0.35em] text-accent/60 sm:col-span-2">
                    連結
                    <input
                      value={item.href || ''}
                      onChange={(event) => updateField(index, 'href', event.target.value)}
                      placeholder="https://"
                      className="mt-2 w-full rounded-xl border border-soft px-3 py-2 text-sm text-accent focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/40"
                    />
                  </label>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => moveItem(index, -1)}
                  className="rounded-full border border-soft px-3 py-2 font-semibold uppercase tracking-[0.3em] text-accent/70 transition hover:bg-soft/60"
                >
                  上移
                </button>
                <button
                  type="button"
                  onClick={() => moveItem(index, 1)}
                  className="rounded-full border border-soft px-3 py-2 font-semibold uppercase tracking-[0.3em] text-accent/70 transition hover:bg-soft/60"
                >
                  下移
                </button>
                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  className="rounded-full border border-red-300 px-3 py-2 font-semibold uppercase tracking-[0.3em] text-red-500 transition hover:bg-red-50"
                >
                  刪除
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-2xl border border-dashed border-soft/80 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.35em] text-accent">新增項目</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-[160px,1fr]">
          <label className="flex flex-col gap-3 text-xs font-semibold uppercase tracking-[0.3em] text-accent/70">
            圖片預覽
            {newItem.image ? (
              <img src={newItem.image} alt="預覽" className="aspect-square w-full rounded-xl object-cover" />
            ) : (
              <div className="flex aspect-square items-center justify-center rounded-xl border border-dashed border-soft text-accent/40">
                尚未選擇
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  handleNewItemFile(file);
                  event.target.value = '';
                }
              }}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold uppercase tracking-[0.35em] text-accent/60 sm:col-span-2">
              或貼上圖片網址
              <input
                value={newItem.image}
                onChange={(event) => setNewItem((prev) => ({ ...prev, image: event.target.value }))}
                placeholder="https:// 或 data:image"
                className="mt-2 w-full rounded-xl border border-soft px-3 py-2 text-sm text-accent focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/40"
              />
            </label>
            {fields.includes('title') && (
              <label className="block text-xs font-semibold uppercase tracking-[0.35em] text-accent/60">
                標題
                <input
                  value={newItem.title}
                  onChange={(event) => setNewItem((prev) => ({ ...prev, title: event.target.value }))}
                  className="mt-2 w-full rounded-xl border border-soft px-3 py-2 text-sm text-accent focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/40"
                />
              </label>
            )}
            {fields.includes('caption') && (
              <label className="block text-xs font-semibold uppercase tracking-[0.35em] text-accent/60 sm:col-span-2">
                註解 / 說明
                <textarea
                  value={newItem.caption}
                  onChange={(event) => setNewItem((prev) => ({ ...prev, caption: event.target.value }))}
                  rows={3}
                  className="mt-2 w-full rounded-xl border border-soft px-3 py-2 text-sm text-accent focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/40"
                />
              </label>
            )}
            {showLink && (
              <label className="block text-xs font-semibold uppercase tracking-[0.35em] text-accent/60 sm:col-span-2">
                連結
                <input
                  value={newItem.href}
                  onChange={(event) => setNewItem((prev) => ({ ...prev, href: event.target.value }))}
                  placeholder="https://"
                  className="mt-2 w-full rounded-xl border border-soft px-3 py-2 text-sm text-accent focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/40"
                />
              </label>
            )}
            <div className="sm:col-span-2">
              <button
                type="button"
                onClick={addItem}
                disabled={!newItem.image}
                className="rounded-full bg-brand px-5 py-2 text-xs font-semibold uppercase tracking-[0.35em] text-white transition disabled:cursor-not-allowed disabled:bg-brand/30"
              >
                新增
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProfileEditor({ dataset, commitOptions }) {
  const [draft, setDraft] = useState(dataset.items);
  const [linkDraft, setLinkDraft] = useState(dataset.items?.links || []);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    setDraft(dataset.items);
    setLinkDraft(dataset.items?.links || []);
  }, [dataset.items]);

  const hasChanges = useMemo(() => {
    try {
      return (
        JSON.stringify(draft) !== JSON.stringify(dataset.items) ||
        JSON.stringify(linkDraft) !== JSON.stringify(dataset.items?.links || [])
      );
    } catch (error) {
      return true;
    }
  }, [draft, dataset.items, linkDraft]);

  const updateField = (field, value) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
  };

  const updateLinkField = (index, field, value) => {
    setLinkDraft((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    );
  };

  const addLink = () => {
    setLinkDraft((prev) => [...prev, { label: '', href: '', description: '' }]);
  };

  const removeLink = (index) => {
    setLinkDraft((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  const persist = async () => {
    const next = { ...draft, links: linkDraft };
    if (!hasChanges || saving) return;
    setSaving(true);
    setFeedback({ type: 'info', message: 'Saving profile...' });
    try {
      const result = await dataset.setItems(next, commitOptions);
      setFeedback({
        type: 'success',
        message: result?.message || 'Profile synced and committed.',
      });
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error?.message || 'Update failed, please try again later.',
      });
    } finally {
      setSaving(false);
    }
  };

  const resetDraft = () => {
    setDraft(dataset.items);
    setLinkDraft(dataset.items?.links || []);
  };

  const resetToDefault = () => {
    dataset.reset();
  };

  const handleAvatar = async (file) => {
    try {
      const dataUrl = await toDataUrl(file);
      updateField('avatar', dataUrl);
    } catch (error) {
      console.error('failed to read file', error);
    }
  };

  return (
    <section className="rounded-3xl border border-soft/60 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 border-b border-soft/40 pb-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-accent">About / Profile</h2>
          <p className="text-sm text-accent/70">管理頭像、簡介、聯絡資料與外部連結。</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <button
            type="button"
            onClick={persist}
            disabled={!hasChanges || saving}
            className="rounded-full bg-accent px-4 py-2 font-semibold uppercase tracking-[0.35em] text-white transition disabled:cursor-not-allowed disabled:bg-accent/30"
          >
            {saving ? '同步中…' : '套用變更'}
          </button>
          <button
            type="button"
            onClick={resetDraft}
            className="rounded-full border border-soft px-4 py-2 font-semibold uppercase tracking-[0.35em] text-accent/70 transition hover:bg-soft/60"
          >
            還原草稿
          </button>
          <button
            type="button"
            onClick={resetToDefault}
            className="rounded-full border border-brand/40 px-4 py-2 font-semibold uppercase tracking-[0.35em] text-brand transition hover:bg-brand/10"
          >
            回復預設
          </button>
          {feedback?.message && (
            <span
              className={`text-[0.65rem] font-medium tracking-[0.2em] ${feedback.type === 'error' ? 'text-red-500' : feedback.type === 'success' ? 'text-brand' : 'text-accent/50'}`}
            >
              {feedback.message}
            </span>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-[240px,1fr]">
        <label className="flex flex-col gap-3 text-xs font-semibold uppercase tracking-[0.3em] text-accent/70">
          頭像
          {draft?.avatar ? (
            <img src={draft.avatar} alt="avatar" className="aspect-square w-full rounded-2xl object-cover" />
          ) : (
            <div className="flex aspect-square items-center justify-center rounded-2xl border border-dashed border-soft text-accent/40">
              無頭像
            </div>
          )}
          <input
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                handleAvatar(file);
                event.target.value = '';
              }
            }}
          />
          <input
            value={draft?.avatar || ''}
            onChange={(event) => updateField('avatar', event.target.value)}
            placeholder="也可貼上圖片網址"
            className="rounded-xl border border-soft px-3 py-2 text-sm text-accent focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/40"
          />
        </label>
        <div className="space-y-4">
          <label className="block text-xs font-semibold uppercase tracking-[0.35em] text-accent/60">
            名稱
            <input
              value={draft?.name || ''}
              onChange={(event) => updateField('name', event.target.value)}
              className="mt-2 w-full rounded-xl border border-soft px-3 py-2 text-sm text-accent focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/40"
            />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-[0.35em] text-accent/60">
            標題 / Headline
            <input
              value={draft?.headline || ''}
              onChange={(event) => updateField('headline', event.target.value)}
              className="mt-2 w-full rounded-xl border border-soft px-3 py-2 text-sm text-accent focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/40"
            />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-[0.35em] text-accent/60">
            Email
            <input
              value={draft?.email || ''}
              onChange={(event) => updateField('email', event.target.value)}
              className="mt-2 w-full rounded-xl border border-soft px-3 py-2 text-sm text-accent focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/40"
            />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-[0.35em] text-accent/60">
            簡介段落（每行一段）
            <textarea
              value={(draft?.bio || []).join('\n')}
              onChange={(event) => updateField('bio', event.target.value.split('\n'))}
              rows={5}
              className="mt-2 w-full rounded-xl border border-soft px-3 py-2 text-sm text-accent focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/40"
            />
          </label>
        </div>
      </div>

      <div className="mt-8 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-[0.35em] text-accent/70">Links</h3>
          <button
            type="button"
            onClick={addLink}
            className="rounded-full border border-brand/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.35em] text-brand transition hover:bg-brand/10"
          >
            新增連結
          </button>
        </div>
        <div className="space-y-4">
          {linkDraft.map((link, index) => (
            <div key={`${link.href}-${index}`} className="grid gap-3 rounded-2xl border border-soft/60 p-4 md:grid-cols-3">
              <label className="text-xs font-semibold uppercase tracking-[0.35em] text-accent/60">
                標籤
                <input
                  value={link.label || ''}
                  onChange={(event) => updateLinkField(index, 'label', event.target.value)}
                  className="mt-2 w-full rounded-xl border border-soft px-3 py-2 text-sm text-accent focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/40"
                />
              </label>
              <label className="text-xs font-semibold uppercase tracking-[0.35em] text-accent/60">
                連結
                <input
                  value={link.href || ''}
                  onChange={(event) => updateLinkField(index, 'href', event.target.value)}
                  placeholder="https://"
                  className="mt-2 w-full rounded-xl border border-soft px-3 py-2 text-sm text-accent focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/40"
                />
              </label>
              <label className="text-xs font-semibold uppercase tracking-[0.35em] text-accent/60">
                說明
                <input
                  value={link.description || ''}
                  onChange={(event) => updateLinkField(index, 'description', event.target.value)}
                  className="mt-2 w-full rounded-xl border border-soft px-3 py-2 text-sm text-accent focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/40"
                />
              </label>
              <div className="md:col-span-3">
                <button
                  type="button"
                  onClick={() => removeLink(index)}
                  className="rounded-full border border-red-300 px-3 py-2 text-xs font-semibold uppercase tracking-[0.35em] text-red-500 transition hover:bg-red-50"
                >
                  刪除
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function AdminPage() {
  const pixilart = useEditableData('pixilartItems', defaultPixilart);
  const art = useEditableData('artItems', defaultArt);
  const type = useEditableData('typeItems', defaultType);
  const work = useEditableData('workItems', defaultWork);
  const profile = useEditableData('profileData', defaultProfile, 'object');

  const [authToken, setAuthToken] = useState('');
  const [commitMessage, setCommitMessage] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const storedToken = window.localStorage.getItem('adminApiToken');
      const storedMessage = window.localStorage.getItem('adminCommitMessage');
      if (storedToken) setAuthToken(storedToken);
      if (storedMessage) setCommitMessage(storedMessage);
    } catch (error) {
      console.warn('Failed to load admin defaults', error);
    }
  }, []);

  const handleTokenChange = (value) => {
    setAuthToken(value);
    if (typeof window === 'undefined') return;
    if (value) {
      window.localStorage.setItem('adminApiToken', value);
    } else {
      window.localStorage.removeItem('adminApiToken');
    }
  };

  const handleCommitMessageChange = (value) => {
    setCommitMessage(value);
    if (typeof window === 'undefined') return;
    if (value) {
      window.localStorage.setItem('adminCommitMessage', value);
    } else {
      window.localStorage.removeItem('adminCommitMessage');
    }
  };

  const commitOptions = {
    token: authToken || undefined,
    commitMessage,
  };

  const hasToken = Boolean(authToken.trim());


  return (
    <div className="space-y-8 pb-20">
      <PageHeader
        title="Backstage"
        subtitle="上傳圖片或更新文字後，請記得按「套用變更」同步到網站。"
      />
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5">
        <div className="rounded-3xl border border-soft/70 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold uppercase tracking-[0.35em] text-accent/60">操作設定</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-accent/60">
              API Token
              <input
                type="password"
                value={authToken}
                onChange={(event) => handleTokenChange(event.target.value)}
                placeholder="ADMIN_API_TOKEN"
                className="rounded-xl border border-soft px-3 py-2 text-sm text-accent focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/40"
              />
              <span className="text-[0.65rem] uppercase tracking-[0.3em] text-accent/40">
                Token 只會儲存在這台瀏覽器，換裝置時請重新輸入。
              </span>
            </label>
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-accent/60">
              Commit Message
              <input
                value={commitMessage}
                onChange={(event) => handleCommitMessageChange(event.target.value)}
                placeholder="chore: update site content"
                className="rounded-xl border border-soft px-3 py-2 text-sm text-accent focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/40"
              />
              <span className="text-[0.65rem] uppercase tracking-[0.3em] text-accent/40">
                可自訂備註，留空會使用預設訊息。
              </span>
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-[0.65rem] uppercase tracking-[0.3em]">
            <span
              className={`rounded-full border px-3 py-1 ${
                hasToken ? 'border-brand/40 text-brand' : 'border-red-200 text-red-500'
              }`}
            >
              {hasToken ? 'Token Ready' : 'Token Missing'}
            </span>
            <span className="text-accent/40">請確認欄位與伺服器的 ADMIN_API_TOKEN 相同。</span>
          </div>
        </div>
        <div className="rounded-3xl border border-dashed border-brand/40 bg-brand/5 p-6 text-sm leading-relaxed text-accent/80">
          <p className="font-semibold text-accent">使用說明</p>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>調整內容後，請按「套用變更」。</li>
            <li>顯示成功訊息後約 1 分鐘，網站會自動更新。</li>
            <li>若遇到錯誤或網站沒有變動，請再試一次或通知管理者。</li>
          </ul>
        </div>
        <GalleryManager
          commitOptions={commitOptions}
          title="Pixilart 首頁作品"
          description="管理像素插畫與 GIF，保留原有的首頁動畫與排版。"
          dataset={pixilart}
        />
        <GalleryManager
          commitOptions={commitOptions}
          title="Work 作品集"
          description="管理案例如需連結至原始文章，可設定標題、說明與外部連結。"
          dataset={work}
          fields={['title', 'caption']}
          showLink
        />
        <GalleryManager
          commitOptions={commitOptions}
          title="Art 插畫集"
          description="新增或刪除插畫圖像，維持大量作品瀑布流展示。"
          dataset={art}
          fields={['caption']}
        />
        <GalleryManager
          commitOptions={commitOptions}
          title="Type 字體排版"
          description="更新字體實驗作品，適合使用 2 欄排版。"
          dataset={type}
          fields={['caption']}
        />
        <ProfileEditor dataset={profile} commitOptions={commitOptions} />
      </div>
    </div>
  );
}
