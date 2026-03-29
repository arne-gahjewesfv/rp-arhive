import { useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import "./index.css";

/* ---------------------------
   IndexedDB helpers
--------------------------- */
/* ---------------------------
   Persistent storage helpers
--------------------------- */
const DB_NAME = "rp-archive-db";
const DB_VERSION = 1;
const STORE_NAME = "app_state";
const STORAGE_KEY = "rp_archive_main";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(value, key);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

function localGet(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function localSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

async function loadPersistedProject() {
  const local = localGet(STORAGE_KEY);
  if (local?.threads?.length) return local;

  try {
    const indexed = await idbGet(STORAGE_KEY);
    if (indexed?.threads?.length) return indexed;
  } catch (error) {
    console.error("IndexedDB load failed:", error);
  }

  return null;
}

async function savePersistedProject(project) {
  localSet(STORAGE_KEY, project);

  try {
    await idbSet(STORAGE_KEY, project);
  } catch (error) {
    console.error("IndexedDB save failed:", error);
  }
}

/* ---------------------------
   Utilities
--------------------------- */
function uid() {
  return crypto.randomUUID();
}

function reorderArray(items, fromIndex, toIndex) {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length
  ) {
    return items;
  }
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function fileSafeName(name) {
  return (name || "archive").replace(/[\\/:*?"<>|]/g, "_");
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function dataUrlToBlob(dataUrl) {
  const parts = dataUrl.split(",");
  const mime = parts[0].match(/:(.*?);/)?.[1] || "image/png";
  const binary = atob(parts[1]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function filesToImageObjects(files) {
  const jobs = files.map(
    (file) =>
      new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () =>
          resolve({
            id: uid(),
            src: String(reader.result),
            name: file.name,
            caption: "",
          });
        reader.readAsDataURL(file);
      })
  );
  return Promise.all(jobs);
}

/* ---------------------------
   Defaults
--------------------------- */
const DEFAULT_THEME = {
  bg: "#d8d7d4",
  surface: "#a7a5a4",
  accent: "#b08f93",
  note: "#d7d7d5",
  button: "#6a4547",
  text: "#33312f",
};

const DEFAULT_APP_SETTINGS = {
  topLabel: "The Sinners",
  brandTitle: "RP Archive",
  topLabelColor: "#7b6a70",
  brandTitleColor: "#2f2b2d",
  topLabelSize: 12,
  brandTitleSize: 28,
  theme: { ...DEFAULT_THEME },
};

function createTextPost() {
  return {
    id: uid(),
    avatar: "",
    nickname: "닉네임",
    username: "@username",
    text: "텍스트를 입력하세요.",
    comment: "",
    textColor: "#33312f",
    commentAlign: "left",
  };
}

function createTextBlock() {
  return {
    id: uid(),
    type: "text",
    width: "normal",
    displayMode: "stack",
    activePostIndex: 0,
    posts: [createTextPost()],
  };
}

function createGalleryBlock(images = []) {
  return {
    id: uid(),
    type: "gallery",
    width: "normal",
    displayMode: "carousel",
    imageRatio: "landscape",
    imageFit: "contain",
    activeImageIndex: 0,
    captionAlign: "left",
    images,
  };
}

function createMemoOverlay(color, layer = 1) {
  return {
    id: uid(),
    type: "memo",
    text: "메모를 입력해줘",
    color,
    x: 120,
    y: 120,
    width: 220,
    height: 160,
    rotation: 0,
    layer,
  };
}

function createStickerOverlay(src, name, layer = 1) {
  return {
    id: uid(),
    type: "sticker",
    src,
    name,
    x: 160,
    y: 160,
    width: 140,
    rotation: 0,
    layer,
  };
}

function createThread() {
  return {
    id: uid(),
    title: "제목 없음",
    subtitle: "부제를 입력하세요.",
    intro: "소개를 입력하세요.",
    label: "ARCHIVE",
    date: "",
    titleAlign: "left",
    subtitleAlign: "left",
    introAlign: "left",
    links: [],
    blocks: [],
    overlays: [],
  };
}

function createDefaultProject() {
  const thread = createThread();
  return {
    appSettings: { ...DEFAULT_APP_SETTINGS },
    threads: [thread],
    activeThreadId: thread.id,
  };
}

/* ---------------------------
   App
--------------------------- */
export default function App() {
  const [project, setProject] = useState(null);
  const saveTimerRef = useRef(null);

  useEffect(() => {
  let alive = true;

  async function load() {
    try {
      const saved = await loadPersistedProject();
      if (!alive) return;

      if (saved?.threads?.length) {
        setProject({
          appSettings: {
            ...DEFAULT_APP_SETTINGS,
            ...(saved.appSettings || {}),
            theme: {
              ...DEFAULT_THEME,
              ...(saved.appSettings?.theme || {}),
            },
          },
          threads: saved.threads,
          activeThreadId:
            saved.activeThreadId || saved.threads[0]?.id || null,
        });
      } else {
        setProject(createDefaultProject());
      }
    } catch (error) {
      console.error("Project load failed:", error);
      setProject(createDefaultProject());
    }
  }

  load();
  return () => {
    alive = false;
  };
}, []);

useEffect(() => {
  if (!project) return;

  clearTimeout(saveTimerRef.current);
  saveTimerRef.current = setTimeout(() => {
    savePersistedProject(project).catch((error) => {
      console.error("저장 실패", error);
    });
  }, 180);

  return () => clearTimeout(saveTimerRef.current);
}, [project]);

  if (!project) {
    return <div className="loading-screen">불러오는 중…</div>;
  }

  return <ArchiveEditor project={project} setProject={setProject} />;
}

/* ---------------------------
   Main editor
--------------------------- */
function ArchiveEditor({ project, setProject }) {
  const { appSettings, threads, activeThreadId } = project;
  const activeThread =
    threads.find((thread) => thread.id === activeThreadId) || threads[0];

  const [sidebarEditMode, setSidebarEditMode] = useState(false);
  const [heroEditMode, setHeroEditMode] = useState(false);
  const [editingBlockId, setEditingBlockId] = useState(null);
  const [editingOverlayId, setEditingOverlayId] = useState(null);
  const [lightbox, setLightbox] = useState(null);

  const imageInputRef = useRef(null);
  const stickerInputRef = useRef(null);
  const jsonImportRef = useRef(null);
  const pageRef = useRef(null);
  const contentRef = useRef(null);
  const blockRefs = useRef({});

  const theme = appSettings.theme || DEFAULT_THEME;

  const cssVars = useMemo(
    () => ({
      "--theme-bg": theme.bg,
      "--theme-surface": theme.surface,
      "--theme-accent": theme.accent,
      "--theme-note": theme.note,
      "--theme-button": theme.button,
      "--theme-text": theme.text,
    }),
    [theme]
  );

  const updateProject = (updater) => {
    setProject((prev) => updater(prev));
  };

  const updateAppSettings = (patch) => {
    updateProject((prev) => ({
      ...prev,
      appSettings: {
        ...prev.appSettings,
        ...patch,
      },
    }));
  };

  const updateGlobalTheme = (key, value) => {
    updateProject((prev) => ({
      ...prev,
      appSettings: {
        ...prev.appSettings,
        theme: {
          ...(prev.appSettings.theme || DEFAULT_THEME),
          [key]: value,
        },
      },
    }));
  };

  const resetTheme = () => {
    updateProject((prev) => ({
      ...prev,
      appSettings: {
        ...prev.appSettings,
        theme: { ...DEFAULT_THEME },
      },
    }));
  };

  const updateThread = (updater) => {
    setProject((prev) => ({
      ...prev,
      threads: prev.threads.map((thread) =>
        thread.id === activeThread.id ? updater(thread) : thread
      ),
    }));
  };

  const setActiveThreadId = (threadId) => {
    setProject((prev) => ({
      ...prev,
      activeThreadId: threadId,
    }));
    setHeroEditMode(false);
    setEditingBlockId(null);
    setEditingOverlayId(null);
  };

  const addThread = () => {
    const next = createThread();
    setProject((prev) => ({
      ...prev,
      threads: [...prev.threads, next],
      activeThreadId: next.id,
    }));
    setHeroEditMode(true);
    setEditingBlockId(null);
    setEditingOverlayId(null);
  };

  const deleteThread = (threadId) => {
    if (threads.length === 1) return;
    const nextThreads = threads.filter((thread) => thread.id !== threadId);
    setProject((prev) => ({
      ...prev,
      threads: nextThreads,
      activeThreadId:
        prev.activeThreadId === threadId
          ? nextThreads[0].id
          : prev.activeThreadId,
    }));
    setHeroEditMode(false);
    setEditingBlockId(null);
    setEditingOverlayId(null);
  };

  const updateThreadField = (key, value) => {
    updateThread((thread) => ({
      ...thread,
      [key]: value,
    }));
  };

  const addLink = () => {
    updateThread((thread) => ({
      ...thread,
      links: [...(thread.links || []), { id: uid(), label: "", url: "" }],
    }));
  };

  const updateLink = (linkId, patch) => {
    updateThread((thread) => ({
      ...thread,
      links: (thread.links || []).map((link) =>
        link.id === linkId ? { ...link, ...patch } : link
      ),
    }));
  };

  const deleteLink = (linkId) => {
    updateThread((thread) => ({
      ...thread,
      links: (thread.links || []).filter((link) => link.id !== linkId),
    }));
  };

  const addTextBlock = () => {
    const block = createTextBlock();
    updateThread((thread) => ({
      ...thread,
      blocks: [...thread.blocks, block],
    }));
    setEditingBlockId(block.id);
    setEditingOverlayId(null);
    setHeroEditMode(false);
  };

  const handleAddImageBlock = async (files) => {
    const images = await filesToImageObjects(files);
    const block = createGalleryBlock(images);
    updateThread((thread) => ({
      ...thread,
      blocks: [...thread.blocks, block],
    }));
    setEditingBlockId(block.id);
    setEditingOverlayId(null);
    setHeroEditMode(false);
  };

  const addMoreImagesToBlock = async (blockId, files) => {
    const images = await filesToImageObjects(files);
    updateThread((thread) => ({
      ...thread,
      blocks: thread.blocks.map((block) =>
        block.id === blockId
          ? { ...block, images: [...(block.images || []), ...images] }
          : block
      ),
    }));
  };

  const updateBlock = (blockId, patch) => {
    updateThread((thread) => ({
      ...thread,
      blocks: thread.blocks.map((block) =>
        block.id === blockId ? { ...block, ...patch } : block
      ),
    }));
  };

  const deleteBlock = (blockId) => {
    updateThread((thread) => ({
      ...thread,
      blocks: thread.blocks.filter((block) => block.id !== blockId),
    }));
    if (editingBlockId === blockId) setEditingBlockId(null);
  };

  const moveBlock = (fromIndex, toIndex) => {
    updateThread((thread) => ({
      ...thread,
      blocks: reorderArray(thread.blocks, fromIndex, toIndex),
    }));
  };

  const updateImageCaption = (blockId, imageIndex, caption) => {
    updateThread((thread) => ({
      ...thread,
      blocks: thread.blocks.map((block) => {
        if (block.id !== blockId) return block;
        const nextImages = [...(block.images || [])];
        nextImages[imageIndex] = {
          ...nextImages[imageIndex],
          caption,
        };
        return { ...block, images: nextImages };
      }),
    }));
  };

  const moveBlockImage = (blockId, fromIndex, toIndex) => {
    updateThread((thread) => ({
      ...thread,
      blocks: thread.blocks.map((block) => {
        if (block.id !== blockId) return block;
        return {
          ...block,
          images: reorderArray(block.images || [], fromIndex, toIndex),
          activeImageIndex:
            block.activeImageIndex === fromIndex
              ? toIndex
              : block.activeImageIndex,
        };
      }),
    }));
  };

  const addTextPost = (blockId) => {
    updateThread((thread) => ({
      ...thread,
      blocks: thread.blocks.map((block) =>
        block.id === blockId
          ? { ...block, posts: [...(block.posts || []), createTextPost()] }
          : block
      ),
    }));
  };

  const updateTextPost = (blockId, postId, patch) => {
    updateThread((thread) => ({
      ...thread,
      blocks: thread.blocks.map((block) => {
        if (block.id !== blockId) return block;
        return {
          ...block,
          posts: (block.posts || []).map((post) =>
            post.id === postId ? { ...post, ...patch } : post
          ),
        };
      }),
    }));
  };

  const deleteTextPost = (blockId, postId) => {
    updateThread((thread) => ({
      ...thread,
      blocks: thread.blocks.map((block) => {
        if (block.id !== blockId) return block;
        const nextPosts = (block.posts || []).filter((post) => post.id !== postId);
        return {
          ...block,
          posts: nextPosts.length ? nextPosts : [createTextPost()],
          activePostIndex: 0,
        };
      }),
    }));
  };

  const moveTextPost = (blockId, fromIndex, toIndex) => {
    updateThread((thread) => ({
      ...thread,
      blocks: thread.blocks.map((block) => {
        if (block.id !== blockId) return block;
        return {
          ...block,
          posts: reorderArray(block.posts || [], fromIndex, toIndex),
          activePostIndex:
            block.activePostIndex === fromIndex
              ? toIndex
              : block.activePostIndex,
        };
      }),
    }));
  };

  const nextOverlayLayer = () => {
    const layers = (activeThread.overlays || []).map((item) => item.layer || 1);
    return Math.max(0, ...layers) + 1;
  };

  const addMemo = () => {
    const memo = createMemoOverlay(theme.note, nextOverlayLayer());
    updateThread((thread) => ({
      ...thread,
      overlays: [...(thread.overlays || []), memo],
    }));
    setEditingOverlayId(memo.id);
    setEditingBlockId(null);
    setHeroEditMode(false);
  };

  const handleAddSticker = async (files) => {
    const jobs = files.map(
      (file) =>
        new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () =>
            resolve({
              src: String(reader.result),
              name: file.name,
            });
          reader.readAsDataURL(file);
        })
    );

    const images = await Promise.all(jobs);

    updateThread((thread) => {
      let layer = nextOverlayLayer();
      const stickers = images.map((item, idx) => ({
        ...createStickerOverlay(item.src, item.name, layer + idx),
        x: 180 + idx * 24,
        y: 180 + idx * 24,
      }));

      return {
        ...thread,
        overlays: [...(thread.overlays || []), ...stickers],
      };
    });
  };

  const updateOverlay = (overlayId, patch) => {
    updateThread((thread) => ({
      ...thread,
      overlays: (thread.overlays || []).map((overlay) =>
        overlay.id === overlayId ? { ...overlay, ...patch } : overlay
      ),
    }));
  };

  const deleteOverlay = (overlayId) => {
    updateThread((thread) => ({
      ...thread,
      overlays: (thread.overlays || []).filter(
        (overlay) => overlay.id !== overlayId
      ),
    }));
    if (editingOverlayId === overlayId) setEditingOverlayId(null);
  };

  const duplicateOverlay = (overlayId) => {
    updateThread((thread) => {
      const target = (thread.overlays || []).find((item) => item.id === overlayId);
      if (!target) return thread;
      const copy = {
        ...target,
        id: uid(),
        x: (target.x || 0) + 24,
        y: (target.y || 0) + 24,
        layer: nextOverlayLayer(),
      };
      return {
        ...thread,
        overlays: [...(thread.overlays || []), copy],
      };
    });
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(project, null, 2)], {
      type: "application/json",
    });
    downloadBlob(blob, "rp-archive-project.json");
  };

  const importJson = async (file) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed?.threads) || !parsed.threads.length) {
        alert("올바른 JSON 파일이 아니야.");
        return;
      }
      setProject({
        appSettings: {
          ...DEFAULT_APP_SETTINGS,
          ...(parsed.appSettings || {}),
          theme: {
            ...DEFAULT_THEME,
            ...(parsed.appSettings?.theme || {}),
          },
        },
        threads: parsed.threads,
        activeThreadId:
          parsed.activeThreadId || parsed.threads[0]?.id || null,
      });
      setSidebarEditMode(false);
      setHeroEditMode(false);
      setEditingBlockId(null);
      setEditingOverlayId(null);
    } catch {
      alert("JSON 파일을 읽지 못했어.");
    }
  };

  const exportWholePage = async (type = "png") => {
    if (!pageRef.current) return;

    const prev = {
      sidebarEditMode,
      heroEditMode,
      editingBlockId,
      editingOverlayId,
    };

    setSidebarEditMode(false);
    setHeroEditMode(false);
    setEditingBlockId(null);
    setEditingOverlayId(null);

    await nextFrame();
    await nextFrame();
    await nextFrame();

    document.body.classList.add("capture-exporting");

    try {
      const canvas = await html2canvas(pageRef.current, {
        backgroundColor: theme.bg,
        scale: 2,
        useCORS: true,
        logging: false,
        windowWidth: pageRef.current.scrollWidth,
        windowHeight: pageRef.current.scrollHeight,
      });

      const filename = fileSafeName(activeThread.title || "archive");

      if (type === "jpg") {
        const dataUrl = canvas.toDataURL("image/jpeg", 0.94);
        downloadBlob(dataUrlToBlob(dataUrl), `${filename}.jpg`);
      } else {
        canvas.toBlob((blob) => {
          if (blob) downloadBlob(blob, `${filename}.png`);
        }, "image/png");
      }
    } finally {
      document.body.classList.remove("capture-exporting");
      setSidebarEditMode(prev.sidebarEditMode);
      setHeroEditMode(prev.heroEditMode);
      setEditingBlockId(prev.editingBlockId);
      setEditingOverlayId(prev.editingOverlayId);
    }
  };

  const exportBlock = async (blockId, type = "png") => {
    const element = blockRefs.current[blockId];
    if (!element) return;

    const prev = {
      sidebarEditMode,
      heroEditMode,
      editingBlockId,
      editingOverlayId,
    };

    setSidebarEditMode(false);
    setHeroEditMode(false);
    setEditingBlockId(null);
    setEditingOverlayId(null);

    await nextFrame();
    await nextFrame();
    await nextFrame();

    document.body.classList.add("capture-exporting");

    try {
      const canvas = await html2canvas(element, {
        backgroundColor: theme.surface,
        scale: 2,
        useCORS: true,
        logging: false,
      });

      const block = activeThread.blocks.find((item) => item.id === blockId);
      const filename = fileSafeName(
        `${activeThread.title || "archive"}-${block?.type || "block"}`
      );

      if (type === "jpg") {
        const dataUrl = canvas.toDataURL("image/jpeg", 0.94);
        downloadBlob(dataUrlToBlob(dataUrl), `${filename}.jpg`);
      } else {
        canvas.toBlob((blob) => {
          if (blob) downloadBlob(blob, `${filename}.png`);
        }, "image/png");
      }
    } finally {
      document.body.classList.remove("capture-exporting");
      setSidebarEditMode(prev.sidebarEditMode);
      setHeroEditMode(prev.heroEditMode);
      setEditingBlockId(prev.editingBlockId);
      setEditingOverlayId(prev.editingOverlayId);
    }
  };

  const visibleLinks = (activeThread.links || []).filter(
    (link) => link.label?.trim() || link.url?.trim()
  );

  return (
    <div className="app-shell themed-app" style={cssVars}>
      <aside className="sidebar" onClick={(e) => e.stopPropagation()}>
        <div
          className={`sidebar-top ${sidebarEditMode ? "sidebar-top-edit" : ""}`}
          onDoubleClick={(e) => {
            e.stopPropagation();
            setSidebarEditMode(true);
            setHeroEditMode(false);
            setEditingBlockId(null);
            setEditingOverlayId(null);
          }}
        >
          {sidebarEditMode ? (
            <div className="sidebar-brand-editor">
              <label className="sidebar-brand-group">
                <span>윗줄 문구</span>
                <input
                  value={appSettings.topLabel}
                  onChange={(e) =>
                    updateAppSettings({ topLabel: e.target.value })
                  }
                />
              </label>

              <label className="sidebar-brand-group">
                <span>브랜드명</span>
                <input
                  value={appSettings.brandTitle}
                  onChange={(e) =>
                    updateAppSettings({ brandTitle: e.target.value })
                  }
                />
              </label>

              <div className="sidebar-brand-grid">
                <label className="theme-control">
                  <span>윗줄 색</span>
                  <input
                    type="color"
                    value={appSettings.topLabelColor}
                    onChange={(e) =>
                      updateAppSettings({ topLabelColor: e.target.value })
                    }
                  />
                </label>

                <label className="theme-control">
                  <span>제목 색</span>
                  <input
                    type="color"
                    value={appSettings.brandTitleColor}
                    onChange={(e) =>
                      updateAppSettings({ brandTitleColor: e.target.value })
                    }
                  />
                </label>

                <label className="sidebar-brand-group">
                  <span>윗줄 크기</span>
                  <input
                    type="number"
                    min="10"
                    max="40"
                    value={appSettings.topLabelSize}
                    onChange={(e) =>
                      updateAppSettings({ topLabelSize: Number(e.target.value) })
                    }
                  />
                </label>

                <label className="sidebar-brand-group">
                  <span>제목 크기</span>
                  <input
                    type="number"
                    min="18"
                    max="60"
                    value={appSettings.brandTitleSize}
                    onChange={(e) =>
                      updateAppSettings({
                        brandTitleSize: Number(e.target.value),
                      })
                    }
                  />
                </label>
              </div>

              <button
                className="mini"
                onClick={() => setSidebarEditMode(false)}
              >
                저장
              </button>
            </div>
          ) : (
            <>
              <div
                className="sidebar-top-label"
                style={{
                  color: appSettings.topLabelColor,
                  fontSize: `${appSettings.topLabelSize}px`,
                }}
              >
                {appSettings.topLabel}
              </div>

              <h1
                style={{
                  color: appSettings.brandTitleColor,
                  fontSize: `${appSettings.brandTitleSize}px`,
                }}
              >
                {appSettings.brandTitle}
              </h1>
            </>
          )}
        </div>

        <button className="primary-btn shimmer-btn" onClick={addThread}>
          + 새 타래
        </button>

        <div className="sidebar-sticker-card">
          <div className="sidebar-edit-group">
            <label>추가</label>
          </div>
          <div className="sidebar-file-actions single-column">
            <button className="mini" onClick={() => imageInputRef.current?.click()}>
              이미지 블록 추가
            </button>
            <button className="mini ghost" onClick={addTextBlock}>
              텍스트 블록 추가
            </button>
            <button className="mini" onClick={addMemo}>
              메모 추가
            </button>
            <button
              className="mini ghost"
              onClick={() => stickerInputRef.current?.click()}
            >
              스티커 추가
            </button>
          </div>

          <input
            ref={imageInputRef}
            hidden
            type="file"
            accept="image/*"
            multiple
            onChange={async (e) => {
              const files = Array.from(e.target.files || []);
              if (!files.length) return;
              await handleAddImageBlock(files);
              e.target.value = "";
            }}
          />

          <input
            ref={stickerInputRef}
            hidden
            type="file"
            accept="image/*"
            multiple
            onChange={async (e) => {
              const files = Array.from(e.target.files || []);
              if (!files.length) return;
              await handleAddSticker(files);
              e.target.value = "";
            }}
          />
        </div>

        <div className="sidebar-sticker-card">
          <div className="sidebar-edit-group">
            <label>색상 커스터마이징</label>
          </div>

          <div className="theme-grid sidebar-theme-grid">
            <label className="theme-control">
              <span>배경색</span>
              <input
                type="color"
                value={theme.bg}
                onChange={(e) => updateGlobalTheme("bg", e.target.value)}
              />
            </label>

            <label className="theme-control">
              <span>카드색</span>
              <input
                type="color"
                value={theme.surface}
                onChange={(e) => updateGlobalTheme("surface", e.target.value)}
              />
            </label>

            <label className="theme-control">
              <span>강조색</span>
              <input
                type="color"
                value={theme.accent}
                onChange={(e) => updateGlobalTheme("accent", e.target.value)}
              />
            </label>

            <label className="theme-control">
              <span>메모색</span>
              <input
                type="color"
                value={theme.note}
                onChange={(e) => updateGlobalTheme("note", e.target.value)}
              />
            </label>

            <label className="theme-control">
              <span>버튼색</span>
              <input
                type="color"
                value={theme.button}
                onChange={(e) => updateGlobalTheme("button", e.target.value)}
              />
            </label>

            <label className="theme-control">
              <span>글자색</span>
              <input
                type="color"
                value={theme.text}
                onChange={(e) => updateGlobalTheme("text", e.target.value)}
              />
            </label>
          </div>

          <button className="mini ghost full-width" onClick={resetTheme}>
            기본값 복원
          </button>
        </div>

        <div className="sidebar-sticker-card">
          <div className="sidebar-edit-group">
            <label>파일</label>
          </div>
          <div className="sidebar-file-actions">
            <button className="mini" onClick={exportJson}>
              JSON 내보내기
            </button>
            <button
              className="mini ghost"
              onClick={() => jsonImportRef.current?.click()}
            >
              JSON 불러오기
            </button>
            <button className="mini" onClick={() => exportWholePage("png")}>
              PNG 저장
            </button>
            <button className="mini ghost" onClick={() => exportWholePage("jpg")}>
              JPG 저장
            </button>
          </div>

          <input
            ref={jsonImportRef}
            hidden
            type="file"
            accept="application/json"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              await importJson(file);
              e.target.value = "";
            }}
          />
        </div>

        <div className="thread-list">
          {threads.map((thread, index) => (
            <div
              key={thread.id}
              className={`thread-item ${thread.id === activeThread.id ? "active" : ""}`}
              onClick={() => setActiveThreadId(thread.id)}
            >
              <div className="thread-item-text">
                <strong>
                  {index + 1}. {thread.title || "제목 없음"}
                </strong>
                {thread.date ? <span>{thread.date}</span> : null}
              </div>

              {threads.length > 1 && (
                <button
                  className="mini danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteThread(thread.id);
                  }}
                >
                  삭제
                </button>
              )}
            </div>
          ))}
        </div>
      </aside>

      <main className="content" onClick={(e) => e.stopPropagation()}>
        <div ref={contentRef} className="content-stage">
          <div ref={pageRef}>
            <section
              className={`hero-card ${heroEditMode ? "page-edit-active" : ""}`}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setHeroEditMode(true);
                setSidebarEditMode(false);
                setEditingBlockId(null);
                setEditingOverlayId(null);
              }}
            >
              {heroEditMode ? (
                <>
                  <div className="hero-top-row">
                    <input
                      className="hero-decoration-input"
                      value={activeThread.label || "ARCHIVE"}
                      onChange={(e) => updateThreadField("label", e.target.value)}
                      placeholder="상단 라벨"
                    />

                    <input
                      className="hero-date-input"
                      type="date"
                      value={activeThread.date || ""}
                      onChange={(e) => updateThreadField("date", e.target.value)}
                    />
                  </div>

                  <input
                    className="hero-title"
                    value={activeThread.title}
                    onChange={(e) => updateThreadField("title", e.target.value)}
                    style={{ textAlign: activeThread.titleAlign || "left" }}
                  />

                  <input
                    className="hero-subtitle"
                    value={activeThread.subtitle}
                    onChange={(e) =>
                      updateThreadField("subtitle", e.target.value)
                    }
                    style={{ textAlign: activeThread.subtitleAlign || "left" }}
                  />

                  <textarea
                    className="hero-intro"
                    value={activeThread.intro}
                    onChange={(e) => updateThreadField("intro", e.target.value)}
                    style={{ textAlign: activeThread.introAlign || "left" }}
                  />

                  <div className="hero-align-panel">
                    <label className="size-control">
                      <span>제목</span>
                      <select
                        value={activeThread.titleAlign || "left"}
                        onChange={(e) =>
                          updateThreadField("titleAlign", e.target.value)
                        }
                      >
                        <option value="left">좌</option>
                        <option value="center">가운데</option>
                        <option value="right">우</option>
                        <option value="justify">양측</option>
                      </select>
                    </label>

                    <label className="size-control">
                      <span>부제</span>
                      <select
                        value={activeThread.subtitleAlign || "left"}
                        onChange={(e) =>
                          updateThreadField("subtitleAlign", e.target.value)
                        }
                      >
                        <option value="left">좌</option>
                        <option value="center">가운데</option>
                        <option value="right">우</option>
                        <option value="justify">양측</option>
                      </select>
                    </label>

                    <label className="size-control">
                      <span>소개</span>
                      <select
                        value={activeThread.introAlign || "left"}
                        onChange={(e) =>
                          updateThreadField("introAlign", e.target.value)
                        }
                      >
                        <option value="left">좌</option>
                        <option value="center">가운데</option>
                        <option value="right">우</option>
                        <option value="justify">양측</option>
                      </select>
                    </label>
                  </div>

                  <div className="link-editor-list">
                    {(activeThread.links || []).map((link) => (
                      <div key={link.id} className="link-editor-row">
                        <input
                          value={link.label}
                          onChange={(e) =>
                            updateLink(link.id, { label: e.target.value })
                          }
                          placeholder="링크 이름"
                        />
                        <input
                          value={link.url}
                          onChange={(e) =>
                            updateLink(link.id, { url: e.target.value })
                          }
                          placeholder="https://..."
                        />
                        <button
                          className="mini danger"
                          onClick={() => deleteLink(link.id)}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="hero-links">
                    <button className="mini ghost" onClick={addLink}>
                      + 링크 추가
                    </button>
                    <button
                      className="mini"
                      onClick={() => setHeroEditMode(false)}
                    >
                      저장
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="hero-readonly-top">
                    <span className="hero-label-text">{activeThread.label}</span>
                    {activeThread.date ? (
                      <span className="hero-date-text">{activeThread.date}</span>
                    ) : null}
                  </div>

                  <h2
                    className="hero-title-read"
                    style={{ textAlign: activeThread.titleAlign || "left" }}
                  >
                    {activeThread.title}
                  </h2>

                  {activeThread.subtitle ? (
                    <div
                      className="hero-text-block hero-subtitle-read"
                      style={{ textAlign: activeThread.subtitleAlign || "left" }}
                    >
                      {activeThread.subtitle}
                    </div>
                  ) : null}

                  {activeThread.intro ? (
                    <div
                      className="hero-text-block hero-intro-read"
                      style={{ textAlign: activeThread.introAlign || "left" }}
                    >
                      {activeThread.intro}
                    </div>
                  ) : null}

                  {visibleLinks.length > 0 && (
                    <div className="hero-links">
                      {visibleLinks.map((link) => (
                        <a
                          key={link.id}
                          href={link.url || "#"}
                          target="_blank"
                          rel="noreferrer"
                          className="hero-link-pill"
                        >
                          {link.label || "링크"}
                        </a>
                      ))}
                    </div>
                  )}
                </>
              )}
            </section>

            <section className="thread-flow">
              {activeThread.blocks.length === 0 ? (
                <div className="empty-flow">아직 블록이 없어.</div>
              ) : (
                activeThread.blocks.map((block, index) => {
                  if (block.type === "text") {
                    return (
                      <TextBlock
                        key={block.id}
                        blockRef={(node) => {
                          blockRefs.current[block.id] = node;
                        }}
                        block={block}
                        index={index}
                        total={activeThread.blocks.length}
                        isEditing={editingBlockId === block.id}
                        onEdit={() => {
                          setEditingBlockId(block.id);
                          setEditingOverlayId(null);
                          setHeroEditMode(false);
                          setSidebarEditMode(false);
                        }}
                        onSave={() => setEditingBlockId(null)}
                        onChange={(patch) => updateBlock(block.id, patch)}
                        onAddPost={() => addTextPost(block.id)}
                        onUpdatePost={(postId, patch) =>
                          updateTextPost(block.id, postId, patch)
                        }
                        onDeletePost={(postId) =>
                          deleteTextPost(block.id, postId)
                        }
                        onMovePost={(fromIndex, toIndex) =>
                          moveTextPost(block.id, fromIndex, toIndex)
                        }
                        onDelete={() => deleteBlock(block.id)}
                        onMoveUp={() => moveBlock(index, index - 1)}
                        onMoveDown={() => moveBlock(index, index + 1)}
                        onExportPng={() => exportBlock(block.id, "png")}
                        onExportJpg={() => exportBlock(block.id, "jpg")}
                      />
                    );
                  }

                  return (
                    <GalleryBlock
                      key={block.id}
                      blockRef={(node) => {
                        blockRefs.current[block.id] = node;
                      }}
                      block={block}
                      index={index}
                      total={activeThread.blocks.length}
                      isEditing={editingBlockId === block.id}
                      onEdit={() => {
                        setEditingBlockId(block.id);
                        setEditingOverlayId(null);
                        setHeroEditMode(false);
                        setSidebarEditMode(false);
                      }}
                      onSave={() => setEditingBlockId(null)}
                      onChange={(patch) => updateBlock(block.id, patch)}
                      onAddMoreImages={(files) =>
                        addMoreImagesToBlock(block.id, files)
                      }
                      onMoveImage={(fromIndex, toIndex) =>
                        moveBlockImage(block.id, fromIndex, toIndex)
                      }
                      onUpdateImageCaption={(imageIndex, caption) =>
                        updateImageCaption(block.id, imageIndex, caption)
                      }
                      onDelete={() => deleteBlock(block.id)}
                      onMoveUp={() => moveBlock(index, index - 1)}
                      onMoveDown={() => moveBlock(index, index + 1)}
                      onOpenImage={(src, alt) => setLightbox({ src, alt })}
                      onExportPng={() => exportBlock(block.id, "png")}
                      onExportJpg={() => exportBlock(block.id, "jpg")}
                    />
                  );
                })
              )}
            </section>
          </div>

          <PageOverlayLayer
            overlays={activeThread.overlays || []}
            editingOverlayId={editingOverlayId}
            contentRef={contentRef}
            onEdit={(overlayId) => {
              setEditingOverlayId(overlayId);
              setEditingBlockId(null);
              setHeroEditMode(false);
              setSidebarEditMode(false);
            }}
            onSave={() => setEditingOverlayId(null)}
            onChange={updateOverlay}
            onDelete={deleteOverlay}
            onDuplicate={duplicateOverlay}
          />
        </div>
      </main>

      {lightbox && (
        <div className="lightbox-overlay" onClick={() => setLightbox(null)}>
          <button
            className="lightbox-close"
            onClick={(e) => {
              e.stopPropagation();
              setLightbox(null);
            }}
          >
            ×
          </button>
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <img src={lightbox.src} alt={lightbox.alt} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------
   Text block
--------------------------- */
function TextBlock({
  blockRef,
  block,
  index,
  total,
  isEditing,
  onEdit,
  onSave,
  onChange,
  onAddPost,
  onUpdatePost,
  onDeletePost,
  onMovePost,
  onDelete,
  onMoveUp,
  onMoveDown,
  onExportPng,
  onExportJpg,
}) {
  const activeIndex = block.activePostIndex ?? 0;
  const activePost = block.posts?.[activeIndex];

  return (
    <article
      ref={blockRef}
      className={`flow-block block-width-${block.width || "normal"} ${
        isEditing ? "flow-block-selected" : "flow-block-view"
      }`}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onEdit();
      }}
    >
      {isEditing && (
        <>
          <div className="block-tools">
            <span className="block-type">TEXT</span>

            <div className="block-tool-buttons">
              <button className="mini" onClick={onMoveUp} disabled={index === 0}>
                ↑
              </button>
              <button
                className="mini"
                onClick={onMoveDown}
                disabled={index === total - 1}
              >
                ↓
              </button>

              <label className="size-control inline-size-control">
                <span>가로</span>
                <select
                  value={block.width || "normal"}
                  onChange={(e) => onChange({ width: e.target.value })}
                >
                  <option value="narrow">좁게</option>
                  <option value="normal">보통</option>
                  <option value="wide">넓게</option>
                  <option value="full">꽉차게</option>
                </select>
              </label>

              <label className="size-control inline-size-control">
                <span>표시 방식</span>
                <select
                  value={block.displayMode || "stack"}
                  onChange={(e) => onChange({ displayMode: e.target.value })}
                >
                  <option value="stack">세로 나열형</option>
                  <option value="carousel">슬라이드형</option>
                </select>
              </label>

              <button className="mini ghost" onClick={onAddPost}>
                카드 추가
              </button>
              <button className="mini ghost" onClick={onExportPng}>
                블록 PNG
              </button>
              <button className="mini ghost" onClick={onExportJpg}>
                블록 JPG
              </button>
              <button className="mini danger" onClick={onDelete}>
                삭제
              </button>
              <button className="mini" onClick={onSave}>
                저장
              </button>
            </div>
          </div>

          {block.displayMode === "stack" ? (
            <div className="tweet-block-stack">
              {(block.posts || []).map((post, idx) => (
                <TextPostEditor
                  key={post.id}
                  post={post}
                  index={idx}
                  total={block.posts.length}
                  editing={true}
                  onChange={(patch) => onUpdatePost(post.id, patch)}
                  onDelete={() => onDeletePost(post.id)}
                  onMoveUp={() => onMovePost(idx, idx - 1)}
                  onMoveDown={() => onMovePost(idx, idx + 1)}
                  disableUp={idx === 0}
                  disableDown={idx === block.posts.length - 1}
                />
              ))}
            </div>
          ) : (
            <>
              {activePost ? (
                <TextPostEditor
                  post={activePost}
                  index={activeIndex}
                  total={block.posts.length}
                  editing={true}
                  onChange={(patch) => onUpdatePost(activePost.id, patch)}
                  onDelete={() => onDeletePost(activePost.id)}
                  onMoveUp={() => onMovePost(activeIndex, activeIndex - 1)}
                  onMoveDown={() => onMovePost(activeIndex, activeIndex + 1)}
                  disableUp={activeIndex === 0}
                  disableDown={activeIndex === block.posts.length - 1}
                />
              ) : null}

              {(block.posts?.length || 0) > 1 && (
                <div className="gallery-pager text-pager">
                  <button
                    className="pager-arrow"
                    onClick={() =>
                      onChange({
                        activePostIndex:
                          (activeIndex - 1 + block.posts.length) % block.posts.length,
                      })
                    }
                  >
                    ←
                  </button>

                  <div className="pager-dots">
                    {block.posts.map((post, idx) => (
                      <button
                        key={post.id}
                        className={`pager-dot ${idx === activeIndex ? "active" : ""}`}
                        onClick={() => onChange({ activePostIndex: idx })}
                      />
                    ))}
                  </div>

                  <button
                    className="pager-arrow"
                    onClick={() =>
                      onChange({
                        activePostIndex: (activeIndex + 1) % block.posts.length,
                      })
                    }
                  >
                    →
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {!isEditing && (
        <>
          <div className="tweet-block-stack">
            {(
              block.displayMode === "carousel"
                ? [block.posts?.[activeIndex]].filter(Boolean)
                : block.posts || []
            ).map((post) => (
              <TextPostEditor
                key={post.id}
                post={post}
                editing={false}
              />
            ))}
          </div>

          {block.displayMode === "carousel" && (block.posts?.length || 0) > 1 && (
            <div className="gallery-pager text-pager">
              <button
                className="pager-arrow"
                onClick={() =>
                  onChange({
                    activePostIndex:
                      (activeIndex - 1 + block.posts.length) % block.posts.length,
                  })
                }
              >
                ←
              </button>

              <div className="pager-dots">
                {block.posts.map((post, idx) => (
                  <button
                    key={post.id}
                    className={`pager-dot ${idx === activeIndex ? "active" : ""}`}
                    onClick={() => onChange({ activePostIndex: idx })}
                  />
                ))}
              </div>

              <button
                className="pager-arrow"
                onClick={() =>
                  onChange({
                    activePostIndex: (activeIndex + 1) % block.posts.length,
                  })
                }
              >
                →
              </button>
            </div>
          )}
        </>
      )}
    </article>
  );
}

function TextPostEditor({
  post,
  index = 0,
  total = 1,
  editing = false,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  disableUp,
  disableDown,
}) {
  const avatarInputRef = useRef(null);

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (!file || !onChange) return;

    const reader = new FileReader();
    reader.onload = () => {
      onChange({ avatar: String(reader.result) });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <div className="tweet-editor-wrap">
      {editing && (
        <div className="tweet-editor-topbar">
          <span>
            {index + 1} / {total}
          </span>

          <div className="tweet-editor-topbar-actions">
            <button className="mini ghost" onClick={onMoveUp} disabled={disableUp}>
              ↑ 순서
            </button>
            <button className="mini ghost" onClick={onMoveDown} disabled={disableDown}>
              ↓ 순서
            </button>
            <button className="mini ghost" onClick={() => avatarInputRef.current?.click()}>
              인장 추가
            </button>
            <button className="mini danger" onClick={onDelete}>
              카드 삭제
            </button>
          </div>
        </div>
      )}

      <input
        ref={avatarInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={handleAvatarChange}
      />

      <div
        className="tweet-surface-card tweet-view-card"
        style={{ color: post.textColor || "var(--theme-text)" }}
      >
        <div className="tweet-view-avatar-wrap">
          {post.avatar ? (
            <img src={post.avatar} alt="avatar" className="tweet-avatar" />
          ) : (
            <div className="tweet-avatar tweet-avatar-placeholder">
              {editing ? "+" : ""}
            </div>
          )}
        </div>

        <div className="tweet-view-main">
          {editing ? (
            <>
              <div className="tweet-editor-topline">
                <input
                  className="tweet-meta-input"
                  value={post.nickname || ""}
                  onChange={(e) => onChange?.({ nickname: e.target.value })}
                  placeholder="닉네임"
                />

                <input
                  className="tweet-meta-input"
                  value={post.username || ""}
                  onChange={(e) => onChange?.({ username: e.target.value })}
                  placeholder="@username"
                />
              </div>

              <div className="tweet-color-row">
                <label className="theme-control tweet-color-control">
                  <span>글자색</span>
                  <input
                    type="color"
                    value={post.textColor || "#33312f"}
                    onChange={(e) => onChange?.({ textColor: e.target.value })}
                  />
                </label>

                <label className="size-control">
                  <span>감상 정렬</span>
                  <select
                    value={post.commentAlign || "left"}
                    onChange={(e) => onChange?.({ commentAlign: e.target.value })}
                  >
                    <option value="left">좌</option>
                    <option value="center">가운데</option>
                    <option value="right">우</option>
                    <option value="justify">양측</option>
                  </select>
                </label>
              </div>

              <textarea
                className="tweet-text-editor"
                value={post.text || ""}
                onChange={(e) => onChange?.({ text: e.target.value })}
                placeholder="본문"
                style={{ color: post.textColor || "var(--theme-text)" }}
              />

              <textarea
                className="tweet-comment-editor"
                value={post.comment || ""}
                onChange={(e) => onChange?.({ comment: e.target.value })}
                placeholder="감상"
                style={{
                  color: post.textColor || "var(--theme-text)",
                  textAlign: post.commentAlign || "left",
                }}
              />
            </>
          ) : (
            <>
              <div className="tweet-view-head">
                <strong className="tweet-view-nickname">
                  {post.nickname || "닉네임"}
                </strong>
                <span className="tweet-view-username">
                  {post.username || "@username"}
                </span>
              </div>

              <div className="tweet-view-text">{post.text}</div>

              {post.comment ? (
                <div
                  className="tweet-comment-view"
                  style={{ textAlign: post.commentAlign || "left" }}
                >
                  {post.comment}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------
   Gallery block
--------------------------- */
function GalleryBlock({
  blockRef,
  block,
  index,
  total,
  isEditing,
  onEdit,
  onSave,
  onChange,
  onAddMoreImages,
  onMoveImage,
  onUpdateImageCaption,
  onDelete,
  onMoveUp,
  onMoveDown,
  onOpenImage,
  onExportPng,
  onExportJpg,
}) {
  const addInputRef = useRef(null);
  const activeIndex = block.activeImageIndex ?? 0;
  const activeImage = block.images?.[activeIndex];

  return (
    <article
      ref={blockRef}
      className={`flow-block block-width-${block.width || "normal"} ${
        isEditing ? "flow-block-selected" : "flow-block-view"
      }`}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onEdit();
      }}
    >
      {isEditing && (
        <>
          <div className="block-tools">
            <span className="block-type">GALLERY</span>

            <div className="block-tool-buttons">
              <button className="mini" onClick={onMoveUp} disabled={index === 0}>
                ↑
              </button>
              <button
                className="mini"
                onClick={onMoveDown}
                disabled={index === total - 1}
              >
                ↓
              </button>
              <button
                className="mini ghost"
                onClick={() => addInputRef.current?.click()}
              >
                이미지 추가
              </button>
              <button className="mini ghost" onClick={onExportPng}>
                블록 PNG
              </button>
              <button className="mini ghost" onClick={onExportJpg}>
                블록 JPG
              </button>
              <button className="mini danger" onClick={onDelete}>
                삭제
              </button>
              <button className="mini" onClick={onSave}>
                저장
              </button>
            </div>
          </div>

          <div className="block-size-panel">
            <label className="size-control">
              <span>가로</span>
              <select
                value={block.width || "normal"}
                onChange={(e) => onChange({ width: e.target.value })}
              >
                <option value="narrow">좁게</option>
                <option value="normal">보통</option>
                <option value="wide">넓게</option>
                <option value="full">꽉차게</option>
              </select>
            </label>

            <label className="size-control">
              <span>표시 방식</span>
              <select
                value={block.displayMode || "carousel"}
                onChange={(e) => onChange({ displayMode: e.target.value })}
              >
                <option value="carousel">슬라이드형</option>
                <option value="stack">세로 나열형</option>
              </select>
            </label>

            <label className="size-control">
              <span>프레임 비율</span>
              <select
                value={block.imageRatio || "landscape"}
                onChange={(e) => onChange({ imageRatio: e.target.value })}
              >
                <option value="square">정사각형</option>
                <option value="portrait">세로형</option>
                <option value="landscape">가로형</option>
                <option value="wide">와이드</option>
              </select>
            </label>

            <label className="size-control">
              <span>사진 맞춤</span>
              <select
                value={block.imageFit || "contain"}
                onChange={(e) => onChange({ imageFit: e.target.value })}
              >
                <option value="contain">안 잘리게</option>
                <option value="cover">꽉 차게</option>
              </select>
            </label>

            <label className="size-control">
              <span>감상 정렬</span>
              <select
                value={block.captionAlign || "left"}
                onChange={(e) => onChange({ captionAlign: e.target.value })}
              >
                <option value="left">좌</option>
                <option value="center">가운데</option>
                <option value="right">우</option>
                <option value="justify">양측</option>
              </select>
            </label>
          </div>
        </>
      )}

      {block.displayMode === "stack" ? (
        <div className="stack-gallery">
          {(block.images || []).map((img, idx) => (
            <div key={img.id} className="stack-gallery-item">
              {isEditing && (
                <div className="inner-reorder-row">
                  <button
                    className="mini ghost"
                    onClick={() => onMoveImage(idx, idx - 1)}
                    disabled={idx === 0}
                  >
                    ↑ 순서
                  </button>
                  <button
                    className="mini ghost"
                    onClick={() => onMoveImage(idx, idx + 1)}
                    disabled={idx === block.images.length - 1}
                  >
                    ↓ 순서
                  </button>
                </div>
              )}

              <div
                className={`image-stage image-ratio-${block.imageRatio || "landscape"} image-fit-${block.imageFit || "contain"}`}
              >
                <img
                  src={img.src}
                  alt={img.name || "image"}
                  onClick={() => onOpenImage(img.src, img.name || "image")}
                />
              </div>

              {isEditing ? (
                <input
                  className="caption-input"
                  style={{ textAlign: block.captionAlign || "left" }}
                  value={img.caption || ""}
                  onChange={(e) =>
                    onUpdateImageCaption(idx, e.target.value)
                  }
                  placeholder="감상"
                />
              ) : img.caption ? (
                <div
                  className="stack-caption-view"
                  style={{ textAlign: block.captionAlign || "left" }}
                >
                  {img.caption}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="image-block-shell">
            <div
              className={`image-stage image-ratio-${block.imageRatio || "landscape"} image-fit-${block.imageFit || "contain"}`}
            >
              {activeImage ? (
                <img
                  src={activeImage.src}
                  alt={activeImage.name || "image"}
                  onClick={() => onOpenImage(activeImage.src, activeImage.name || "image")}
                />
              ) : null}

              {(block.images?.length || 0) > 1 && (
                <div className="gallery-pager">
                  <button
                    className="pager-arrow"
                    onClick={() =>
                      onChange({
                        activeImageIndex:
                          (activeIndex - 1 + block.images.length) % block.images.length,
                      })
                    }
                  >
                    ←
                  </button>

                  <div className="pager-dots">
                    {block.images.map((img, idx) => (
                      <button
                        key={img.id}
                        className={`pager-dot ${idx === activeIndex ? "active" : ""}`}
                        onClick={() => onChange({ activeImageIndex: idx })}
                      />
                    ))}
                  </div>

                  <button
                    className="pager-arrow"
                    onClick={() =>
                      onChange({
                        activeImageIndex: (activeIndex + 1) % block.images.length,
                      })
                    }
                  >
                    →
                  </button>
                </div>
              )}
            </div>
          </div>

          {isEditing && (block.images?.length || 0) > 1 && (
            <div className="inner-reorder-row">
              <button
                className="mini ghost"
                onClick={() => onMoveImage(activeIndex, activeIndex - 1)}
                disabled={activeIndex === 0}
              >
                현재 이미지 ↑
              </button>
              <button
                className="mini ghost"
                onClick={() => onMoveImage(activeIndex, activeIndex + 1)}
                disabled={activeIndex === block.images.length - 1}
              >
                현재 이미지 ↓
              </button>
            </div>
          )}

          <input
            className="caption-input"
            style={{ textAlign: block.captionAlign || "left" }}
            value={activeImage?.caption || ""}
            onChange={(e) => onUpdateImageCaption(activeIndex, e.target.value)}
            placeholder="감상"
          />
        </>
      )}

      <input
        ref={addInputRef}
        hidden
        type="file"
        accept="image/*"
        multiple
        onChange={async (e) => {
          const files = Array.from(e.target.files || []);
          if (!files.length) return;
          await onAddMoreImages(files);
          e.target.value = "";
        }}
      />
    </article>
  );
}

/* ---------------------------
   Overlay layer
--------------------------- */
function PageOverlayLayer({
  overlays,
  editingOverlayId,
  contentRef,
  onEdit,
  onSave,
  onChange,
  onDelete,
  onDuplicate,
}) {
  return (
    <div className="page-overlay-layer">
      {[...(overlays || [])]
        .sort((a, b) => (a.layer || 1) - (b.layer || 1))
        .map((overlay) =>
          overlay.type === "memo" ? (
            <FreeMemo
              key={overlay.id}
              overlay={overlay}
              isEditing={editingOverlayId === overlay.id}
              contentRef={contentRef}
              onEdit={() => onEdit(overlay.id)}
              onSave={onSave}
              onChange={(patch) => onChange(overlay.id, patch)}
              onDelete={() => onDelete(overlay.id)}
              onDuplicate={() => onDuplicate(overlay.id)}
            />
          ) : (
            <FreeSticker
              key={overlay.id}
              overlay={overlay}
              isEditing={editingOverlayId === overlay.id}
              contentRef={contentRef}
              onEdit={() => onEdit(overlay.id)}
              onSave={onSave}
              onChange={(patch) => onChange(overlay.id, patch)}
              onDelete={() => onDelete(overlay.id)}
              onDuplicate={() => onDuplicate(overlay.id)}
            />
          )
        )}
    </div>
  );
}

function FreeMemo({
  overlay,
  isEditing,
  contentRef,
  onEdit,
  onSave,
  onChange,
  onDelete,
  onDuplicate,
}) {
  const dragRef = useRef({
    mode: null,
    offsetX: 0,
    offsetY: 0,
    startWidth: 0,
    startHeight: 0,
    startX: 0,
    startY: 0,
  });

  const beginDrag = (e) => {
    if (!isEditing) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = contentRef.current?.getBoundingClientRect();
    if (!rect) return;

    dragRef.current.mode = "drag";
    dragRef.current.offsetX = e.clientX - rect.left - overlay.x;
    dragRef.current.offsetY = e.clientY - rect.top - overlay.y;
    document.body.style.userSelect = "none";

    const handleMove = (event) => {
      if (dragRef.current.mode !== "drag") return;
      onChange({
        x: event.clientX - rect.left - dragRef.current.offsetX,
        y: event.clientY - rect.top - dragRef.current.offsetY,
      });
    };

    const handleUp = () => {
      dragRef.current.mode = null;
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  };

  const beginResize = (e) => {
    if (!isEditing) return;
    e.preventDefault();
    e.stopPropagation();

    dragRef.current.mode = "resize";
    dragRef.current.startWidth = overlay.width || 220;
    dragRef.current.startHeight = overlay.height || 160;
    dragRef.current.startX = e.clientX;
    dragRef.current.startY = e.clientY;
    document.body.style.userSelect = "none";

    const handleMove = (event) => {
      if (dragRef.current.mode !== "resize") return;
      onChange({
        width: Math.max(140, dragRef.current.startWidth + (event.clientX - dragRef.current.startX)),
        height: Math.max(100, dragRef.current.startHeight + (event.clientY - dragRef.current.startY)),
      });
    };

    const handleUp = () => {
      dragRef.current.mode = null;
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  };

  const beginRotate = (e) => {
    if (!isEditing) return;
    e.preventDefault();
    e.stopPropagation();

    const node = e.currentTarget.closest(".memo-overlay");
    if (!node) return;

    const rect = node.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    document.body.style.userSelect = "none";

    const handleMove = (event) => {
      const angle =
        (Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180) /
        Math.PI;
      onChange({ rotation: angle + 90 });
    };

    const handleUp = () => {
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  };

  return (
    <div
      className={`free-overlay memo-overlay ${isEditing ? "overlay-selected" : ""}`}
      style={{
        left: overlay.x,
        top: overlay.y,
        width: overlay.width,
        minHeight: overlay.height,
        background: overlay.color,
        zIndex: overlay.layer || 1,
        transform: `rotate(${overlay.rotation || 0}deg)`,
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onEdit();
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {isEditing && (
        <div className="overlay-clean-toolbar" onMouseDown={beginDrag}>
          <span>MEMO</span>
          <div className="overlay-clean-actions">
            <button className="mini ghost" onClick={onDuplicate}>
              복제
            </button>
            <button className="mini" onClick={onSave}>
              저장
            </button>
            <button className="mini danger" onClick={onDelete}>
              ×
            </button>
          </div>
        </div>
      )}

      {isEditing && (
        <div className="overlay-clean-meta">
          <label className="note-color-control">
            <span>색</span>
            <input
              type="color"
              value={overlay.color || "#d7d7d5"}
              onChange={(e) => onChange({ color: e.target.value })}
            />
          </label>

          <div className="layer-controls">
            <button
              className="mini ghost"
              onClick={() => onChange({ layer: (overlay.layer || 1) + 1 })}
            >
              앞으로
            </button>
            <button
              className="mini ghost"
              onClick={() =>
                onChange({ layer: Math.max(1, (overlay.layer || 1) - 1) })
              }
            >
              뒤로
            </button>
          </div>
        </div>
      )}

      <textarea
        className="free-memo-textarea"
        value={overlay.text}
        onChange={(e) => onChange({ text: e.target.value })}
        style={{ minHeight: `${(overlay.height || 160) - 88}px` }}
      />

      {isEditing && (
        <>
          <button className="drag-rotate-handle" onMouseDown={beginRotate}>
            ↻
          </button>
          <button className="drag-resize-handle" onMouseDown={beginResize} />
        </>
      )}
    </div>
  );
}

function FreeSticker({
  overlay,
  isEditing,
  contentRef,
  onEdit,
  onSave,
  onChange,
  onDelete,
  onDuplicate,
}) {
  const dragRef = useRef({
    mode: null,
    offsetX: 0,
    offsetY: 0,
    startWidth: 0,
    startX: 0,
  });

  const beginDrag = (e) => {
    if (!isEditing) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = contentRef.current?.getBoundingClientRect();
    if (!rect) return;

    dragRef.current.mode = "drag";
    dragRef.current.offsetX = e.clientX - rect.left - overlay.x;
    dragRef.current.offsetY = e.clientY - rect.top - overlay.y;
    document.body.style.userSelect = "none";

    const handleMove = (event) => {
      if (dragRef.current.mode !== "drag") return;
      onChange({
        x: event.clientX - rect.left - dragRef.current.offsetX,
        y: event.clientY - rect.top - dragRef.current.offsetY,
      });
    };

    const handleUp = () => {
      dragRef.current.mode = null;
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  };

  const beginResize = (e) => {
    if (!isEditing) return;
    e.preventDefault();
    e.stopPropagation();

    dragRef.current.mode = "resize";
    dragRef.current.startWidth = overlay.width || 140;
    dragRef.current.startX = e.clientX;
    document.body.style.userSelect = "none";

    const handleMove = (event) => {
      if (dragRef.current.mode !== "resize") return;
      onChange({
        width: Math.max(40, dragRef.current.startWidth + (event.clientX - dragRef.current.startX)),
      });
    };

    const handleUp = () => {
      dragRef.current.mode = null;
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  };

  const beginRotate = (e) => {
    if (!isEditing) return;
    e.preventDefault();
    e.stopPropagation();

    const node = e.currentTarget.closest(".free-sticker");
    if (!node) return;

    const rect = node.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    document.body.style.userSelect = "none";

    const handleMove = (event) => {
      const angle =
        (Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180) /
        Math.PI;
      onChange({ rotation: angle + 90 });
    };

    const handleUp = () => {
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  };

  return (
    <div
      className={`free-overlay free-sticker ${isEditing ? "overlay-selected" : ""}`}
      style={{
        left: overlay.x,
        top: overlay.y,
        width: overlay.width,
        zIndex: overlay.layer || 1,
        transform: `rotate(${overlay.rotation || 0}deg)`,
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onEdit();
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {isEditing && (
        <div className="overlay-clean-toolbar sticker-toolbar" onMouseDown={beginDrag}>
          <span>STICKER</span>
          <div className="overlay-clean-actions">
            <button className="mini ghost" onClick={onDuplicate}>
              복제
            </button>
            <button className="mini" onClick={onSave}>
              저장
            </button>
            <button className="mini danger" onClick={onDelete}>
              ×
            </button>
          </div>
        </div>
      )}

      {isEditing && (
        <div className="overlay-clean-meta sticker-meta">
          <div className="layer-controls">
            <button
              className="mini ghost"
              onClick={() => onChange({ layer: (overlay.layer || 1) + 1 })}
            >
              앞으로
            </button>
            <button
              className="mini ghost"
              onClick={() =>
                onChange({ layer: Math.max(1, (overlay.layer || 1) - 1) })
              }
            >
              뒤로
            </button>
          </div>
        </div>
      )}

      <img src={overlay.src} alt={overlay.name || "sticker"} />

      {isEditing && (
        <>
          <button className="drag-rotate-handle" onMouseDown={beginRotate}>
            ↻
          </button>
          <button className="drag-resize-handle" onMouseDown={beginResize} />
        </>
      )}
    </div>
  );
}