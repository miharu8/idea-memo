"use client";

import React, { useState, useEffect, useRef } from "react";

interface Idea {
  id: string;
  title: string;
  memo: string;
  createdAt: string;
  // "published" は「★ 大事」の印として使います（以前のデータとの互換のため名前は据え置き）
  status: "analyzed" | "published";
}

const STORAGE_KEY = "meditation_ideas_v2";
const DRAFT_KEY = "idea_memo_draft_v1";

export default function IdeaMemoApp() {
  const [title, setTitle] = useState("");
  const [memo, setMemo] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [selectedTab, setSelectedTab] = useState<"all" | "starred">("all");
  const [search, setSearch] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // 編集中のアイデア
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editMemo, setEditMemo] = useState("");

  const [loaded, setLoaded] = useState(false);
  const recognitionRef = useRef<any>(null);

  // 起動時：保存済みのメモと、書きかけの内容を復元
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setIdeas(JSON.parse(saved));
      const draft = localStorage.getItem(DRAFT_KEY);
      if (draft) {
        const d = JSON.parse(draft);
        setTitle(d.title || "");
        setMemo(d.memo || "");
      }
    } catch (e) {
      console.error("読み込みに失敗しました", e);
    }
    setLoaded(true);
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  // 書きかけの内容を自動で残す（うっかりページを閉じても消えない）
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ title, memo }));
    } catch (e) {
      // 失敗しても動作には影響しない
    }
  }, [title, memo, loaded]);

  const saveIdeasToStorage = (newIdeas: Idea[]) => {
    setIdeas(newIdeas);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newIdeas));
    } catch (e) {
      setErrorMessage("保存に失敗しました。ブラウザの保存容量がいっぱいかもしれません。");
    }
  };

  // 音声入力の開始・停止
  const toggleSpeechRecognition = () => {
    setErrorMessage("");

    if (isRecording) {
      recognitionRef.current?.stop();
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setErrorMessage("このブラウザは音声入力に対応していません。Mac の Chrome か Safari をお使いください。");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "ja-JP";
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onstart = () => setIsRecording(true);
    recognition.onresult = (event: any) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) transcript += event.results[i][0].transcript;
      }
      if (transcript) {
        setMemo((prev) => (prev ? `${prev}\n${transcript}` : transcript));
      }
    };
    recognition.onerror = (event: any) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setErrorMessage("マイクの使用が許可されていません。アドレスバー左の設定アイコンからマイクを許可してください。");
      }
      setIsRecording(false);
    };
    recognition.onend = () => {
      setIsRecording(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  // 保存
  const saveIdea = () => {
    if (!title.trim() && !memo.trim()) return;
    recognitionRef.current?.stop();

    const now = new Date();
    const dateStr = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()} ${String(
      now.getHours()
    ).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    const newIdea: Idea = {
      id: Date.now().toString(),
      title: title.trim() || "無題のメモ",
      memo,
      createdAt: dateStr,
      status: "analyzed",
    };

    saveIdeasToStorage([newIdea, ...ideas]);
    setTitle("");
    setMemo("");
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1500);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveIdea();
  };

  // メモ欄で「command + Enter」を押しても保存できる
  const handleMemoKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      saveIdea();
    }
  };

  const handleDelete = (id: string) => {
    if (!window.confirm("このメモを削除しますか？元に戻せません。")) return;
    saveIdeasToStorage(ideas.filter((item) => item.id !== id));
  };

  const handleStarToggle = (id: string) => {
    saveIdeasToStorage(
      ideas.map((item) =>
        item.id === id
          ? { ...item, status: item.status === "published" ? ("analyzed" as const) : ("published" as const) }
          : item
      )
    );
  };

  const startEdit = (item: Idea) => {
    setEditingId(item.id);
    setEditTitle(item.title);
    setEditMemo(item.memo);
  };

  const saveEdit = () => {
    saveIdeasToStorage(
      ideas.map((item) =>
        item.id === editingId
          ? { ...item, title: editTitle.trim() || "無題のメモ", memo: editMemo }
          : item
      )
    );
    setEditingId(null);
  };

  const handleCopy = async (item: Idea) => {
    try {
      await navigator.clipboard.writeText(`${item.title}\n\n${item.memo}`);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch (e) {
      setErrorMessage("コピーに失敗しました。");
    }
  };

  // バックアップ（テキストファイルとして保存）
  const handleDownload = () => {
    const text = ideas
      .map((i) => `■ ${i.title}（${i.createdAt}）\n${i.memo}`)
      .join("\n\n----------\n\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "アイデアメモ.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const keyword = search.trim().toLowerCase();
  const visibleIdeas = ideas
    .filter((item) => (selectedTab === "starred" ? item.status === "published" : true))
    .filter((item) =>
      keyword ? `${item.title} ${item.memo}`.toLowerCase().includes(keyword) : true
    );

  const inputClass =
    "w-full bg-slate-800/90 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/80 placeholder:text-slate-500";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-4 sm:p-6 max-w-lg mx-auto font-sans">
      {/* ヘッダー */}
      <header className="py-4 text-center border-b border-slate-800/80 mb-4">
        <h1 className="text-xl font-bold tracking-tight text-indigo-400">アイデアメモ</h1>
        <p className="text-xs text-slate-400 mt-1">
          思いついたことを、声か文字ですぐ書きとめる
        </p>
      </header>

      <main className="flex-1 space-y-6">
        {/* 入力フォーム */}
        <form
          onSubmit={handleSubmit}
          className="space-y-4 bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-2xl"
        >
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">
              タイトル（なくてもOK）
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例: 瞑想中に気づいたこと"
              className={inputClass}
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="block text-xs font-semibold text-slate-400">メモ</label>
              <button
                type="button"
                onClick={toggleSpeechRecognition}
                className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all flex items-center gap-1 ${
                  isRecording
                    ? "bg-red-500/20 text-red-400 border border-red-500/50 animate-pulse"
                    : "bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-slate-700"
                }`}
              >
                {isRecording ? "🔴 入力をやめる" : "🎤 声で入力"}
              </button>
            </div>
            <textarea
              rows={5}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              onKeyDown={handleMemoKeyDown}
              placeholder="思いついたことをそのまま書く。声で入力もできます。"
              className={inputClass}
            />
            <p className="mt-1.5 text-[11px] text-slate-500">
              書きかけは自動で残ります。「⌘ + Enter」でも保存できます。
            </p>
            {errorMessage && (
              <p className="mt-2 text-xs text-red-400" role="alert">
                {errorMessage}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={!title.trim() && !memo.trim()}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-xl text-sm transition-all shadow-lg shadow-indigo-600/25 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {justSaved ? "✓ 保存しました" : "保存する"}
          </button>
        </form>

        {/* 保存したメモ一覧 */}
        <section className="space-y-3">
          <div className="flex justify-between items-center px-1">
            <h2 className="text-xs font-semibold text-slate-400">
              保存したメモ（{ideas.length}件）
            </h2>
            <div className="flex gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 text-[11px]">
              <button
                onClick={() => setSelectedTab("all")}
                className={`px-2.5 py-0.5 rounded-md transition-all ${
                  selectedTab === "all" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                すべて
              </button>
              <button
                onClick={() => setSelectedTab("starred")}
                className={`px-2.5 py-0.5 rounded-md transition-all ${
                  selectedTab === "starred" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                ★ 大事
              </button>
            </div>
          </div>

          {ideas.length > 0 && (
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍 メモを検索"
              className={inputClass}
            />
          )}

          {visibleIdeas.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-slate-800 rounded-xl">
              <p className="text-xs text-slate-500">
                {ideas.length === 0
                  ? "まだメモはありません。上のフォームから最初のメモを書いてみましょう。"
                  : keyword
                  ? "見つかりませんでした。別の言葉で検索してみてください。"
                  : "★ を付けたメモはまだありません。メモの「☆」を押すと、ここに集まります。"}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleIdeas.map((item) => (
                <div
                  key={item.id}
                  className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-2.5 shadow-md"
                >
                  {editingId === item.id ? (
                    // 編集モード
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className={inputClass}
                        aria-label="タイトルを編集"
                      />
                      <textarea
                        rows={5}
                        value={editMemo}
                        onChange={(e) => setEditMemo(e.target.value)}
                        className={inputClass}
                        aria-label="メモを編集"
                      />
                      <div className="flex gap-2 justify-end text-xs">
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 hover:text-white"
                        >
                          やめる
                        </button>
                        <button
                          onClick={saveEdit}
                          className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500"
                        >
                          変更を保存
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <span className="text-[10px] text-indigo-400 font-medium">
                            {item.createdAt}
                          </span>
                          <h3 className="text-sm font-semibold text-slate-200 mt-0.5">
                            {item.title}
                          </h3>
                        </div>
                        <button
                          onClick={() => handleStarToggle(item.id)}
                          className={`text-lg leading-none px-1 transition-colors ${
                            item.status === "published"
                              ? "text-amber-400"
                              : "text-slate-600 hover:text-amber-300"
                          }`}
                          title={item.status === "published" ? "★ を外す" : "大事なメモに入れる"}
                          aria-label="大事なメモの切り替え"
                        >
                          {item.status === "published" ? "★" : "☆"}
                        </button>
                      </div>

                      {item.memo && (
                        <p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/60">
                          {item.memo}
                        </p>
                      )}

                      <div className="pt-1 flex gap-1.5 justify-end border-t border-slate-800/60 text-[11px]">
                        <button
                          onClick={() => handleCopy(item)}
                          className="px-2.5 py-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800"
                        >
                          {copiedId === item.id ? "✓ コピーしました" : "コピー"}
                        </button>
                        <button
                          onClick={() => startEdit(item)}
                          className="px-2.5 py-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800"
                        >
                          編集
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="px-2.5 py-1 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-800"
                        >
                          削除
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {ideas.length > 0 && (
            <div className="text-center pt-2">
              <button
                onClick={handleDownload}
                className="text-[11px] text-slate-500 hover:text-slate-300 underline underline-offset-2"
              >
                全部のメモをテキストファイルに保存（バックアップ）
              </button>
            </div>
          )}
        </section>
      </main>

      {/* フッター */}
      <footer className="py-4 text-center">
        <p className="text-[11px] text-slate-600">
          メモはこのブラウザの中だけに保存されます（完全無料・通信なし）
        </p>
      </footer>
    </div>
  );
}
