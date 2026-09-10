import { useRef, useState } from "react";
import { eventImageError } from "../imageUpload";

export function EventImageUpload({ eventId, image, onChange, onBusy }: {
  eventId: string;
  image?: string;
  onChange: (image: string | undefined) => void;
  onBusy: (busy: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const uploading = useRef(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [dragging, setDragging] = useState(false);
  const upload = async (file?: File) => {
    if (!file || uploading.current) return;
    const issue = eventImageError(file.type, file.size);
    if (issue) { setMessage(issue); return; }
    uploading.current = true;
    onBusy(true);
    setProgress(0);
    setMessage("업로드 준비 중…");
    try {
      const bitmap = await createImageBitmap(file);
      bitmap.close();
      const response = await fetch("/api/admin/content-studio", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "UPLOAD_EVENT_IMAGE", eventId, contentType: file.type, size: file.size }),
      });
      if (!response.ok) throw new Error("UPLOAD_FAILED");
      const { signedUrl, publicUrl } = await response.json() as { signedUrl: string; publicUrl: string };
      setMessage("업로드 중…");
      await new Promise<void>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open("PUT", signedUrl);
        request.timeout = 120000;
        request.upload.onprogress = (event) => { if (event.lengthComputable) setProgress(Math.round(event.loaded / event.total * 100)); };
        request.onload = () => request.status >= 200 && request.status < 300 ? resolve() : reject(new Error("UPLOAD_FAILED"));
        request.onerror = request.ontimeout = () => reject(new Error("UPLOAD_FAILED"));
        const body = new FormData();
        body.append("cacheControl", "3600");
        body.append("", file);
        request.send(body);
      });
      onChange(publicUrl);
      setMessage("업로드 완료 · 저장하면 반영됩니다.");
    } catch {
      setMessage("이미지를 업로드하지 못했습니다. 파일과 연결을 확인하고 다시 시도하세요.");
    } finally {
      uploading.current = false;
      onBusy(false);
      setProgress(null);
      if (input.current) input.current.value = "";
    }
  };
  return <section className="management-image-upload" aria-label="이벤트 이미지">
    <h3>이미지</h3>
    <div className="management-image-upload__drop" data-dragging={dragging}
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => { event.preventDefault(); setDragging(false); void upload(event.dataTransfer.files[0]); }}>
      <button type="button" disabled={progress !== null} onClick={() => input.current?.click()}>{image ? "이미지 교체" : "이미지 넣기"}</button>
      <span>또는 파일을 여기에 놓기</span>
      {image ? <button type="button" disabled={progress !== null} onClick={() => { onChange(undefined); setMessage("이미지 연결을 해제했습니다. 저장하면 반영됩니다."); }}>이미지 삭제</button> : null}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" aria-label="이미지 파일 선택" hidden onChange={(event) => void upload(event.target.files?.[0])} />
    </div>
    {progress !== null ? <progress max={100} value={progress} aria-label="이미지 업로드 진행률" /> : null}
    <small role="status">{message || "JPG · PNG · WebP / 최대 8MB"}</small>
  </section>;
}
