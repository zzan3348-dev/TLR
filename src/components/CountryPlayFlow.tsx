import { getCountryPresentation } from "../data/countryPresentation";
import type { MapCountryIndex } from "../types/mapCountry";
import { TexturedActionButton } from "./TexturedActionButton";

export type CountryPlayStep =
  | "closed"
  | "description"
  | "confirmation"
  | "complete";

type CountryPlayFlowProps = {
  country: MapCountryIndex | null;
  step: CountryPlayStep;
  onClose: () => void;
  onRequestConfirmation: () => void;
  onBack: () => void;
  onConfirm: () => void;
  busy?: boolean;
  error?: string | null;
};

function DescriptionDialog({
  country,
  obscured,
  onClose,
  onRequestConfirmation,
}: {
  country: MapCountryIndex;
  obscured: boolean;
  onClose: () => void;
  onRequestConfirmation: () => void;
}) {
  const presentation = getCountryPresentation(country);

  return (
    <section
      className="country-play-description"
      aria-hidden={obscured}
      data-obscured={obscured}
    >
      <img
        className="country-play-description__frame"
        src="/assets/ui/country-description-dialog-clean.png"
        alt=""
        draggable={false}
        aria-hidden="true"
      />
      <header className="country-play-description__title">
        <h2>The Long Revolution</h2>
      </header>
      <div className="country-play-description__country-heading">
        <h3>{presentation.title}</h3>
        {presentation.secondaryNames[0] ? (
          <p>{presentation.secondaryNames[0]}</p>
        ) : null}
      </div>
      <div className="country-play-description__body">
        {presentation.description
          ? presentation.description
              .split(/\n{2,}/u)
              .map((paragraph) => <p key={paragraph}>{paragraph}</p>)
          : null}
      </div>
      <div className="country-play-description__actions">
        <TexturedActionButton
          tone="green"
          onClick={onRequestConfirmation}
          disabled={obscured}
          autoFocus={!obscured}
        >
          국가 신청
        </TexturedActionButton>
        <TexturedActionButton
          tone="gray"
          onClick={onClose}
          disabled={obscured}
        >
          닫기
        </TexturedActionButton>
      </div>
      <button
        type="button"
        className="country-play-description__close"
        onClick={onClose}
        disabled={obscured}
        aria-label="국가 설명창 닫기"
      />
    </section>
  );
}

function ConfirmationDialog({
  country,
  onBack,
  onConfirm,
  busy = false,
  error = null,
}: {
  country: MapCountryIndex;
  onBack: () => void;
  onConfirm: () => void;
  busy?: boolean;
  error?: string | null;
}) {
  const presentation = getCountryPresentation(country);

  return (
    <section
      className="country-play-confirmation"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="country-play-confirmation-title"
      aria-describedby="country-play-confirmation-warning"
    >
      <div className="country-play-confirmation__frame-wrap">
        <img
          className="country-play-confirmation__frame"
          src="/assets/ui/play-confirmation-frame.png"
          alt=""
          draggable={false}
          aria-hidden="true"
        />
        <header className="country-play-confirmation__title">
          국가 신청 확인
        </header>
        <div className="country-play-confirmation__message">
          <h2 id="country-play-confirmation-title">
            정말 신청하시겠습니까?
          </h2>
          <p>{presentation.title}</p>
          <strong id="country-play-confirmation-warning">
            Discord 계정에 국가가 배정되며, 개장 전에는 플레이할 수 없습니다.
          </strong>
          {error ? <p className="country-play-confirmation__error" role="alert">{error}</p> : null}
        </div>
        <button
          type="button"
          className="country-play-confirmation__close"
          onClick={onBack}
          aria-label="국가 선택 확인창 닫기"
        />
      </div>
      <div className="country-play-confirmation__actions">
        <TexturedActionButton tone="green" onClick={onConfirm} disabled={busy} autoFocus>
          {busy ? "신청 중…" : "신청하기"}
        </TexturedActionButton>
        <TexturedActionButton tone="gray" onClick={onBack}>
          돌아가기
        </TexturedActionButton>
      </div>
    </section>
  );
}

function CompletionDialog({ onClose }: { onClose: () => void }) {
  return (
    <section className="country-play-confirmation" role="dialog" aria-modal="true" aria-labelledby="country-application-complete-title">
      <div className="country-play-confirmation__frame-wrap">
        <img className="country-play-confirmation__frame" src="/assets/ui/play-confirmation-frame.png" alt="" draggable={false} aria-hidden="true" />
        <header className="country-play-confirmation__title">국가 신청</header>
        <div className="country-play-confirmation__message">
          <h2 id="country-application-complete-title">완료되었습니다</h2>
          <p>국가 신청이 접수되었습니다.</p>
          <strong>개장까지 잠시만 기다려주세요.</strong>
        </div>
        <button type="button" className="country-play-confirmation__close" onClick={onClose} aria-label="신청 완료창 닫기" />
      </div>
      <div className="country-play-confirmation__actions">
        <TexturedActionButton tone="green" onClick={onClose} autoFocus>확인</TexturedActionButton>
      </div>
    </section>
  );
}

export function CountryPlayFlow({
  country,
  step,
  onClose,
  onRequestConfirmation,
  onBack,
  onConfirm,
  busy,
  error,
}: CountryPlayFlowProps) {
  if (!country || step === "closed") {
    return null;
  }

  const isConfirmationOpen = step === "confirmation";
  const isCompleteOpen = step === "complete";
  const isModalOpen = isConfirmationOpen || isCompleteOpen;

  return (
    <div
      className="country-play-layer"
      role={isModalOpen ? undefined : "dialog"}
      aria-modal={isModalOpen ? undefined : true}
      aria-label={
        isModalOpen ? undefined : `${country.name} 국가 설명`
      }
      data-step={step}
    >
      <div
        className="country-play-layer__backdrop"
        aria-hidden="true"
      />
      <DescriptionDialog
        key={step}
        country={country}
        obscured={isModalOpen}
        onClose={onClose}
        onRequestConfirmation={onRequestConfirmation}
      />
      {isConfirmationOpen ? (
        <ConfirmationDialog
          country={country}
          onBack={onBack}
          onConfirm={onConfirm}
          busy={busy}
          error={error}
        />
      ) : null}
      {isCompleteOpen ? <CompletionDialog onClose={onClose} /> : null}
    </div>
  );
}
