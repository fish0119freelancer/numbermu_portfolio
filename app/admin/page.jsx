'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import PageHeader from '../_components/PageHeader';
import { useEditableData } from '../_components/useEditableData';
import {
  describeSaveResult,
  IMAGE_ACCEPT,
  validateImageFile,
  waitForDeployment,
} from '../../lib/admin-client.mjs';
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

const readImageFile = async (file) => {
  const validation = validateImageFile(file);
  if (!validation.ok) throw new Error(validation.message);
  return toDataUrl(file);
};

const reportSaveOutcome = async (result, setFeedback) => {
  setFeedback(describeSaveResult(result));
  if (result?.status !== 'saved' || !result?.commitSha) return;

  const deployment = await waitForDeployment(result.commitSha);
  setFeedback(
    deployment.deployed
      ? {
          type: 'success',
          message: 'GitHub 與 Render 都已更新，公開網站現在是最新版本。',
        }
      : {
          type: 'warning',
          message:
            '內容已保存到 GitHub，但等待 Render 更新逾時；請稍後按「重新載入 GitHub」確認，或通知管理者查看部署紀錄。',
        },
  );
};

const slugify = (text) => {
  const cleaned = (text || '')
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned || 'untitled';
};

function GalleryManager({
  title,
  description,
  dataset,
  fields = ['title', 'caption'],
  showLink = false,
  showGallery = false,
  commitOptions,
}) {
  const [draft, setDraft] = useState(dataset.items);
  const [newItem, setNewItem] = useState({ image: '', title: '', slug: '', caption: '', href: '', category: '' });
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [customMode, setCustomMode] = useState(false);
  const preserveDraftOnNextRemote = useRef(false);
  const isCustomMode = customMode || draft.some((item) => item.breakBefore === true);
  const hasBreakBefore = fields.includes('breakBefore') || fields.includes('row');

  useEffect(() => {
    if (preserveDraftOnNextRemote.current) {
      preserveDraftOnNextRemote.current = false;
      return;
    }
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

  const updateNumericField = (index, field, rawValue) => {
    if (rawValue === '' || rawValue === null || rawValue === undefined) {
      updateField(index, field, undefined);
      return;
    }
    const num = Number(rawValue);
    updateField(index, field, Number.isNaN(num) ? undefined : num);
  };

  const makeUniqueSlug = (baseSlug, excludeIndex = -1) => {
    const otherSlugs = draft
      .filter((_, i) => i !== excludeIndex)
      .map((d) => d.slug)
      .filter(Boolean);
    let candidate = baseSlug || 'untitled';
    if (!otherSlugs.includes(candidate)) return candidate;
    let counter = 2;
    while (otherSlugs.includes(`${baseSlug || 'untitled'}-${counter}`)) {
      counter += 1;
    }
    return `${baseSlug || 'untitled'}-${counter}`;
  };

  const replaceImage = async (index, file) => {
    try {
      const dataUrl = await readImageFile(file);
      updateField(index, 'image', dataUrl);
    } catch (error) {
      setFeedback({ type: 'error', message: error.message });
    }
  };

  const removeItem = (index) => {
    setDraft((current) => {
      const itemToRemove = current[index];
      const next = current.filter((_, itemIndex) => itemIndex !== index);
      if (itemToRemove?.breakBefore && index < next.length) {
        next[index] = { ...next[index], breakBefore: true };
      }
      return next;
    });
  };

  const reorderItem = (from, to) => {
    setDraft((current) => {
      if (
        from === null ||
        to === null ||
        from === to ||
        from < 0 ||
        to < 0 ||
        from >= current.length ||
        to >= current.length
      ) {
        return current;
      }
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const clearAllBreaks = () => {
    setDraft((current) => current.map((item) => ({ ...item, breakBefore: undefined, row: undefined })));
    setCustomMode(false);
  };

  const normalizeImg = (img) =>
    typeof img === 'string' ? { image: img, caption: '' } : img;

  const addItemImage = (index, src) => {
    setDraft((current) =>
      current.map((item, i) => {
        if (i !== index) return item;
        const imgs = Array.isArray(item.images) ? item.images : [];
        return { ...item, images: [...imgs, { image: src, caption: '' }] };
      }),
    );
  };

  const updateItemImageField = (index, imgIndex, field, value) => {
    setDraft((current) =>
      current.map((item, i) => {
        if (i !== index) return item;
        const imgs = (Array.isArray(item.images) ? item.images : []).map((img, j) =>
          j === imgIndex ? { ...normalizeImg(img), [field]: value } : normalizeImg(img),
        );
        return { ...item, images: imgs };
      }),
    );
  };

  const removeItemImage = (index, imgIndex) => {
    setDraft((current) =>
      current.map((item, i) => {
        if (i !== index) return item;
        const imgs = (Array.isArray(item.images) ? item.images : []).filter(
          (_, j) => j !== imgIndex,
        );
        return { ...item, images: imgs };
      }),
    );
  };

  const moveItemImage = (index, imgIndex, direction) => {
    setDraft((current) =>
      current.map((item, i) => {
        if (i !== index) return item;
        const imgs = [...(Array.isArray(item.images) ? item.images : [])];
        const target = imgIndex + direction;
        if (target < 0 || target >= imgs.length) return item;
        [imgs[imgIndex], imgs[target]] = [imgs[target], imgs[imgIndex]];
        return { ...item, images: imgs };
      }),
    );
  };

  const handleItemImageFile = async (index, file) => {
    try {
      const dataUrl = await readImageFile(file);
      addItemImage(index, dataUrl);
    } catch (error) {
      setFeedback({ type: 'error', message: error.message });
    }
  };

  const persistAll = async () => {
    if (!hasChanges || saving) return;

    // 防呆：檢查重複 slug
    const slugs = draft.map((d) => d.slug).filter((s) => s && s.trim());
    const dupes = slugs.filter((s, i) => slugs.indexOf(s) !== i);
    if (dupes.length > 0) {
      setFeedback({
        type: 'error',
        message: `網址代稱重複：${[...new Set(dupes)].join('、')}，請先修正再儲存。`,
      });
      return;
    }

    setSaving(true);
    setFeedback({ type: 'info', message: 'Saving changes...' });
    try {
      const result = await dataset.setItems(draft, commitOptions);
      await reportSaveOutcome(result, setFeedback);
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error?.message || 'Update failed, please try again later.',
        action: error?.isConflict ? 'reload' : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const resetDraft = () => {
    setDraft(dataset.items);
  };

  const resetToDefault = () => {
    setDraft(dataset.reset());
    setFeedback({
      type: 'info',
      message: '已載入預設內容；按「套用變更」後才會儲存。',
    });
  };

  const reloadAfterConflict = async () => {
    preserveDraftOnNextRemote.current = true;
    setFeedback({ type: 'info', message: '正在載入 GitHub 最新版本…' });
    try {
      await dataset.reload(commitOptions);
      setFeedback({
        type: 'info',
        message: '已更新版本基準並保留目前草稿；確認內容後可再次儲存。',
      });
    } catch (error) {
      preserveDraftOnNextRemote.current = false;
      setFeedback({ type: 'error', message: error.message });
    }
  };

  const handleNewItemFile = async (file) => {
    try {
      const dataUrl = await readImageFile(file);
      setNewItem((prev) => ({ ...prev, image: dataUrl }));
    } catch (error) {
      setFeedback({ type: 'error', message: error.message });
    }
  };

  const addItem = () => {
    if (!newItem.image) return;
    const baseSlug = newItem.slug || slugify(newItem.title) || 'untitled';
    setDraft((current) => {
      const existingSlugs = current.map((d) => d.slug).filter(Boolean);
      let uniqueSlug = baseSlug;
      let counter = 2;
      while (existingSlugs.includes(uniqueSlug)) {
        uniqueSlug = `${baseSlug}-${counter}`;
        counter += 1;
      }
      return [{ ...newItem, breakBefore: false, slug: uniqueSlug }, ...current];
    });
    setNewItem({ image: '', title: '', slug: '', caption: '', href: '', category: '' });
  };

  const categoryOptions = [...new Set(draft.map(i => i.category).filter(Boolean))];

  return (
    <section className="rounded-3xl border border-soft/60 bg-white p-6 shadow-sm">
      <datalist id={`category-options-${title}`}>
        {categoryOptions.map(cat => <option key={cat} value={cat} />)}
      </datalist>
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
          {hasBreakBefore && (
            <div className="flex items-center gap-1 rounded-full border border-soft/60 bg-soft/20 p-1 text-[0.65rem] font-semibold">
              <button
                type="button"
                onClick={clearAllBreaks}
                className={`rounded-full px-3 py-1 transition ${
                  !isCustomMode
                    ? 'bg-accent text-white shadow-sm'
                    : 'text-accent/60 hover:text-accent'
                }`}
              >
                自動排列（每 3 張一列）
              </button>
              <button
                type="button"
                onClick={() => setCustomMode(true)}
                className={`rounded-full px-3 py-1 transition ${
                  isCustomMode
                    ? 'bg-accent text-white shadow-sm'
                    : 'text-accent/60 hover:text-accent'
                }`}
              >
                自訂分列
              </button>
            </div>
          )}
          {feedback?.message && (
            <span
              role={feedback.type === 'error' ? 'alert' : 'status'}
              aria-live="polite"
              className={`text-[0.65rem] font-medium tracking-[0.2em] ${
                feedback.type === 'error'
                  ? 'text-red-500'
                  : feedback.type === 'success'
                  ? 'text-brand'
                  : feedback.type === 'warning'
                  ? 'text-amber-700'
                  : 'text-accent/50'
              }`}
            >
              {feedback.message}
            </span>
          )}
          {feedback?.action === 'reload' && (
            <button
              type="button"
              onClick={reloadAfterConflict}
              className="rounded-full border border-brand/40 px-3 py-2 font-semibold text-brand transition hover:bg-brand/10"
            >
              載入最新版並保留草稿
            </button>
          )}
        </div>
      </div>

      <div className="mt-6 space-y-6">
        {draft.map((item, index) => (
          <div
            key={`${item.image}-${index}`}
            onDragOver={(event) => {
              event.preventDefault();
              if (dragIndex !== null && dragOverIndex !== index) setDragOverIndex(index);
            }}
            onDrop={(event) => {
              event.preventDefault();
              reorderItem(dragIndex, index);
              setDragIndex(null);
              setDragOverIndex(null);
            }}
            className={`relative grid gap-4 rounded-2xl border p-4 transition md:grid-cols-[160px,1fr] ${
              dragIndex === index
                ? 'border-brand/60 opacity-50'
                : dragOverIndex === index
                ? 'border-brand ring-2 ring-brand/40'
                : 'border-soft/60'
            }`}
          >
            <div className="space-y-3">
              <div
                draggable
                onDragStart={() => setDragIndex(index)}
                onDragEnd={() => {
                  setDragIndex(null);
                  setDragOverIndex(null);
                }}
                title="按住拖曳調整順序"
                className="flex cursor-grab items-center justify-between rounded-lg bg-soft/40 px-3 py-2 text-accent/70 active:cursor-grabbing"
              >
                <span className="text-xs font-semibold tracking-[0.2em]">#{index + 1}</span>
                <span aria-hidden className="text-base leading-none text-accent/40">⠿</span>
              </div>
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
                  accept={IMAGE_ACCEPT}
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
                {fields.includes('width') && (
                  <label className="block text-xs font-semibold uppercase tracking-[0.35em] text-accent/60">
                    排列比例權重
                    <input
                      type="number"
                      value={item.width ?? ''}
                      onChange={(event) => updateNumericField(index, 'width', event.target.value)}
                      placeholder="留空 = 使用預設比例；會依整列寬度自動縮放"
                      className="mt-2 w-full rounded-xl border border-soft px-3 py-2 text-sm text-accent focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/40"
                    />
                  </label>
                )}
                {hasBreakBefore && isCustomMode && index > 0 && (
                  <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold tracking-[0.15em] text-accent/70">
                    <input
                      type="checkbox"
                      checked={Boolean(item.breakBefore)}
                      onChange={(event) =>
                        updateField(index, 'breakBefore', event.target.checked ? true : undefined)
                      }
                      className="h-4 w-4 rounded border-soft text-brand focus:ring-brand/40"
                    />
                    <span>此圖開始新列</span>
                  </label>
                )}
                {fields.includes('title') && (
                  <label className="block text-xs font-semibold uppercase tracking-[0.35em] text-accent/60">
                    標題
                    <input
                      value={item.title || ''}
                      onChange={(event) => {
                        const newTitle = event.target.value;
                        updateField(index, 'title', newTitle);
                        // 如果 slug 是自動產生的（空的或與舊標題相符），則自動更新並去重
                        const oldAutoSlug = slugify(item.title || '');
                        if (!item.slug || item.slug === oldAutoSlug) {
                          updateField(index, 'slug', makeUniqueSlug(slugify(newTitle) || 'untitled', index));
                        }
                      }}
                      placeholder="可選填"
                      className="mt-2 w-full rounded-xl border border-soft px-3 py-2 text-sm text-accent focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/40"
                    />
                  </label>
                )}
                {fields.includes('category') && (
                  <label className="block text-xs font-semibold uppercase tracking-[0.35em] text-accent/60">
                    分類
                    <input
                      value={item.category || ''}
                      onChange={(event) => updateField(index, 'category', event.target.value)}
                      placeholder="例如：角色、地圖、介面（留空 = 未分類）"
                      list={`category-options-${title}`}
                      className="mt-2 w-full rounded-xl border border-soft px-3 py-2 text-sm text-accent focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/40"
                    />
                  </label>
                )}
                {fields.includes('slug') && (
                  <label className="block text-xs font-semibold uppercase tracking-[0.35em] text-accent/60">
                    網址代稱
                    <input
                      value={item.slug || ''}
                      onChange={(event) => updateField(index, 'slug', event.target.value)}
                      placeholder="自動從標題產生，也可手動修改"
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
              {showGallery && (
                <div className="rounded-2xl border border-soft/50 bg-soft/20 p-4">
                  <h4 className="text-xs font-semibold uppercase tracking-[0.35em] text-accent/60">
                    詳細圖片
                  </h4>
                  <p className="mt-1 text-[0.7rem] text-accent/50">
                    點進此作品時，封面下方會依序顯示這些圖片。
                  </p>
                  <div className="mt-3 space-y-3">
                    {(Array.isArray(item.images) ? item.images : []).map((img, imgIndex) => {
                      const imgObj = typeof img === 'string' ? { image: img, caption: '' } : img;
                      return (
                        <div
                          key={`${imgObj.image}-${imgIndex}`}
                          className="grid gap-3 rounded-xl border border-soft/60 bg-white p-3 md:grid-cols-[80px,1fr]"
                        >
                          {imgObj.image ? (
                            <img
                              src={imgObj.image}
                              alt=""
                              className="aspect-square w-full rounded-lg object-cover"
                            />
                          ) : (
                            <div className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-soft text-[0.6rem] text-accent/40">
                              無圖
                            </div>
                          )}
                          <div className="flex flex-col gap-2">
                            <input
                              value={imgObj.image || ''}
                              onChange={(event) =>
                                updateItemImageField(index, imgIndex, 'image', event.target.value)
                              }
                              placeholder="圖片網址或 data:image"
                              className="w-full rounded-lg border border-soft px-3 py-2 text-sm text-accent focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/40"
                            />
                            <input
                              value={imgObj.caption || ''}
                              onChange={(event) =>
                                updateItemImageField(index, imgIndex, 'caption', event.target.value)
                              }
                              placeholder="說明文字（可留空）"
                              className="w-full rounded-lg border border-soft px-3 py-2 text-sm text-accent focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/40"
                            />
                            <div className="flex flex-wrap gap-2 text-[0.65rem]">
                              <button
                                type="button"
                                onClick={() => moveItemImage(index, imgIndex, -1)}
                                className="rounded-full border border-soft px-3 py-1 font-semibold uppercase tracking-[0.2em] text-accent/70 transition hover:bg-soft/60"
                              >
                                上移
                              </button>
                              <button
                                type="button"
                                onClick={() => moveItemImage(index, imgIndex, 1)}
                                className="rounded-full border border-soft px-3 py-1 font-semibold uppercase tracking-[0.2em] text-accent/70 transition hover:bg-soft/60"
                              >
                                下移
                              </button>
                              <button
                                type="button"
                                onClick={() => removeItemImage(index, imgIndex)}
                                className="rounded-full border border-red-300 px-3 py-1 font-semibold uppercase tracking-[0.2em] text-red-500 transition hover:bg-red-50"
                              >
                                刪除
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <label className="cursor-pointer rounded-full border border-brand/40 px-4 py-2 text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-brand transition hover:bg-brand/10">
                      上傳圖片
                      <input
                        type="file"
                        accept={IMAGE_ACCEPT}
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) {
                            handleItemImageFile(index, file);
                            event.target.value = '';
                          }
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => addItemImage(index, '')}
                      className="rounded-full border border-soft px-4 py-2 text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-accent/70 transition hover:bg-soft/60"
                    >
                      新增空白（貼網址）
                    </button>
                  </div>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3 text-xs">
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
        <p className="mt-2 text-xs leading-relaxed text-accent/60">
          支援 PNG、JPEG、GIF、WebP；單張最多 4 MiB，每次儲存的圖片總量最多 12 MiB。
        </p>
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
              accept={IMAGE_ACCEPT}
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
            {fields.includes('width') && (
              <label className="block text-xs font-semibold uppercase tracking-[0.35em] text-accent/60">
                排列比例權重
                <input
                  type="number"
                  value={newItem.width ?? ''}
                  onChange={(event) => {
                    const raw = event.target.value;
                    const val = (raw === '' || raw === null || raw === undefined) ? undefined : (Number.isNaN(Number(raw)) ? undefined : Number(raw));
                    setNewItem((prev) => ({ ...prev, width: val }));
                  }}
                  placeholder="留空 = 使用預設比例；會依整列寬度自動縮放"
                  className="mt-2 w-full rounded-xl border border-soft px-3 py-2 text-sm text-accent focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/40"
                />
              </label>
            )}

            {fields.includes('title') && (
              <label className="block text-xs font-semibold uppercase tracking-[0.35em] text-accent/60">
                標題
                <input
                  value={newItem.title}
                  onChange={(event) => {
                    const newTitle = event.target.value;
                    setNewItem((prev) => {
                      const oldAutoSlug = slugify(prev.title || '');
                      // 只在 slug 是自動產生時才自動更新
                      if (!prev.slug || prev.slug === oldAutoSlug) {
                        const existingSlugs = draft.map((d) => d.slug).filter(Boolean);
                        let candidate = slugify(newTitle) || 'untitled';
                        if (existingSlugs.includes(candidate)) {
                          let counter = 2;
                          while (existingSlugs.includes(`${candidate}-${counter}`)) {
                            counter += 1;
                          }
                          candidate = `${candidate}-${counter}`;
                        }
                        return { ...prev, title: newTitle, slug: candidate };
                      }
                      return { ...prev, title: newTitle };
                    });
                  }}
                  className="mt-2 w-full rounded-xl border border-soft px-3 py-2 text-sm text-accent focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/40"
                />
              </label>
            )}
            {fields.includes('category') && (
              <label className="block text-xs font-semibold uppercase tracking-[0.35em] text-accent/60">
                分類
                <input
                  value={newItem.category || ''}
                  onChange={(event) => setNewItem((prev) => ({ ...prev, category: event.target.value }))}
                  placeholder="例如：角色、地圖、介面（留空 = 未分類）"
                  list={`category-options-${title}`}
                  className="mt-2 w-full rounded-xl border border-soft px-3 py-2 text-sm text-accent focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/40"
                />
              </label>
            )}
            {fields.includes('slug') && (
              <label className="block text-xs font-semibold uppercase tracking-[0.35em] text-accent/60">
                網址代稱
                <input
                  value={newItem.slug}
                  onChange={(event) => setNewItem((prev) => ({ ...prev, slug: event.target.value }))}
                  placeholder="自動從標題產生，也可手動修改"
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
  const preserveDraftOnNextRemote = useRef(false);

  useEffect(() => {
    if (preserveDraftOnNextRemote.current) {
      preserveDraftOnNextRemote.current = false;
      return;
    }
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
      await reportSaveOutcome(result, setFeedback);
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error?.message || 'Update failed, please try again later.',
        action: error?.isConflict ? 'reload' : undefined,
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
    const defaults = dataset.reset();
    setDraft(defaults);
    setLinkDraft(defaults?.links || []);
    setFeedback({
      type: 'info',
      message: '已載入預設內容；按「套用變更」後才會儲存。',
    });
  };

  const reloadAfterConflict = async () => {
    preserveDraftOnNextRemote.current = true;
    setFeedback({ type: 'info', message: '正在載入 GitHub 最新版本…' });
    try {
      await dataset.reload(commitOptions);
      setFeedback({
        type: 'info',
        message: '已更新版本基準並保留目前草稿；確認內容後可再次儲存。',
      });
    } catch (error) {
      preserveDraftOnNextRemote.current = false;
      setFeedback({ type: 'error', message: error.message });
    }
  };

  const handleAvatar = async (file) => {
    try {
      const dataUrl = await readImageFile(file);
      updateField('avatar', dataUrl);
    } catch (error) {
      setFeedback({ type: 'error', message: error.message });
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
              role={feedback.type === 'error' ? 'alert' : 'status'}
              aria-live="polite"
              className={`text-[0.65rem] font-medium tracking-[0.2em] ${feedback.type === 'error' ? 'text-red-500' : feedback.type === 'success' ? 'text-brand' : feedback.type === 'warning' ? 'text-amber-700' : 'text-accent/50'}`}
            >
              {feedback.message}
            </span>
          )}
          {feedback?.action === 'reload' && (
            <button
              type="button"
              onClick={reloadAfterConflict}
              className="rounded-full border border-brand/40 px-3 py-2 font-semibold text-brand transition hover:bg-brand/10"
            >
              載入最新版並保留草稿
            </button>
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
            accept={IMAGE_ACCEPT}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                handleAvatar(file);
                event.target.value = '';
              }
            }}
          />
          <span className="normal-case tracking-normal text-accent/50">
            PNG、JPEG、GIF、WebP；最多 4 MiB。
          </span>
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
  const [authToken, setAuthToken] = useState('');
  const [commitMessage, setCommitMessage] = useState('');
  const editorConfig = useMemo(
    () => ({ token: authToken || undefined }),
    [authToken],
  );
  const pixilart = useEditableData(
    'pixilartItems',
    defaultPixilart,
    'array',
    editorConfig,
  );
  const art = useEditableData('artItems', defaultArt, 'array', editorConfig);
  const type = useEditableData('typeItems', defaultType, 'array', editorConfig);
  const work = useEditableData('workItems', defaultWork, 'array', editorConfig);
  const profile = useEditableData(
    'profileData',
    defaultProfile,
    'object',
    editorConfig,
  );

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

  const commitOptions = useMemo(
    () => ({
      token: authToken || undefined,
      commitMessage,
    }),
    [authToken, commitMessage],
  );

  const hasToken = Boolean(authToken.trim());
  const datasets = [pixilart, art, type, work, profile];
  const loadingRemote = datasets.some((dataset) => dataset.loading);
  const remoteError = datasets.find((dataset) => dataset.loadError)?.loadError;

  const reloadRemote = async () => {
    if (!hasToken || loadingRemote) return;
    try {
      await pixilart.reload({ token: authToken, replaceAll: true });
    } catch {
      // The hook exposes the actionable error below while keeping all drafts intact.
    }
  };


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
            <button
              type="button"
              onClick={reloadRemote}
              disabled={!hasToken || loadingRemote}
              className="rounded-full border border-soft px-3 py-2 font-semibold text-accent/70 transition hover:bg-soft/60 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loadingRemote ? '載入 GitHub 中…' : '重新載入 GitHub'}
            </button>
          </div>
          {remoteError && (
            <p
              role="alert"
              aria-live="polite"
              className="mt-3 text-sm leading-relaxed text-red-600"
            >
              {remoteError.message}
            </p>
          )}
        </div>
        <div className="rounded-3xl border border-dashed border-brand/40 bg-brand/5 p-6 text-sm leading-relaxed text-accent/80">
          <p className="font-semibold text-accent">使用說明</p>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>調整內容後，請按「套用變更」。</li>
            <li>儲存成功代表 GitHub 已更新；Render 完成部署後公開網站才會更新。</li>
            <li>若顯示版本衝突，先載入最新版；系統會保留目前草稿。</li>
            <li>圖片支援 PNG、JPEG、GIF、WebP，單張最多 4 MiB。</li>
          </ul>
        </div>
        <GalleryManager
          commitOptions={commitOptions}
          title="Pixilart 首頁作品"
          description="管理像素插畫與 GIF。分類欄位會在首頁右側縮圖區以標題分組顯示；留空則歸在最上方的未分類區。"
          dataset={pixilart}
          fields={['title', 'caption', 'category']}
        />
        <GalleryManager
          commitOptions={commitOptions}
          title="Work 作品集"
          description="管理案例如需連結至原始文章，可設定標題、說明與外部連結。封面僅用於列表縮圖；點進作品後顯示的是下方「詳細圖片」。"
          dataset={work}
          fields={['title', 'slug', 'caption']}
          showLink
          showGallery
        />
        <GalleryManager
          commitOptions={commitOptions}
          title="Art 插畫集"
          description="拖曳左側 # 把手調整順序。排列比例權重控制同列圖片的相對寬度；留空使用預設比例。預設為自動排列（每 3 張一列），可切換為自訂分列並勾選圖片開始新列。"
          dataset={art}
          fields={['caption', 'width', 'breakBefore']}
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
