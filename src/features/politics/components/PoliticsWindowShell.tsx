import type { CSSProperties, ReactNode } from "react";

export type PoliticsWindowRegions = {
  ideology: ReactNode;
  identity: ReactNode;
  nationalSpirits: ReactNode;
  leaderCaption: ReactNode;
  partySupport: ReactNode;
  governmentSystem: ReactNode;
  powerBase: ReactNode;
  lawScroll: ReactNode;
};

type PoliticsWindowShellProps = {
  ariaLabel: string;
  style: CSSProperties;
  flag: ReactNode;
  portraitPath: string | null;
  regions: PoliticsWindowRegions;
  onClose: () => void;
  closeLabel?: string;
};

export function PoliticsWindowShell({
  ariaLabel,
  style,
  flag,
  portraitPath,
  regions,
  onClose,
  closeLabel = "정치창 닫기",
}: PoliticsWindowShellProps) {
  return (
    <aside
      className="politics-panel politics-panel--template"
      style={style}
      aria-label={ariaLabel}
    >
      <div className="hybrid-country-panel politics-template-panel">
        <span className="politics-template__flag-screen" aria-hidden="true" />
        {flag}
        <img
          className="politics-template__flag-tv-frame"
          src="/assets/ui/flag-tv-frame-v2.png"
          alt=""
          draggable={false}
          aria-hidden="true"
        />
        {portraitPath ? (
          <img
            className="politics-template__portrait-underlay"
            src={portraitPath}
            alt=""
            draggable={false}
          />
        ) : null}
        <img
          className="politics-template__frame"
          src="/assets/ui/politics-panel-frame.png"
          alt=""
          draggable={false}
          aria-hidden="true"
        />

        <div className="hybrid-country-panel__content politics-template-panel__content">
          <div className="hybrid-country-panel__slot hybrid-country-panel__slot--emblem" />
          <section className="hybrid-country-panel__slot hybrid-country-panel__slot--header-small politics-template__ideology">
            {regions.ideology}
          </section>
          <section className="hybrid-country-panel__slot hybrid-country-panel__slot--header-main politics-template__identity">
            {regions.identity}
          </section>
          <section className="hybrid-country-panel__slot hybrid-country-panel__slot--description politics-template__spirits">
            {regions.nationalSpirits}
          </section>
          <section className="hybrid-country-panel__slot hybrid-country-panel__slot--portrait politics-template__leader">
            {regions.leaderCaption}
          </section>
          <section className="hybrid-country-panel__slot hybrid-country-panel__slot--right-detail politics-template__party">
            {regions.partySupport}
          </section>
          <section className="hybrid-country-panel__slot hybrid-country-panel__slot--middle-info-top politics-template__government-system">
            {regions.governmentSystem}
          </section>
          <section
            className="hybrid-country-panel__slot hybrid-country-panel__slot--middle-info-bottom politics-template__power-base"
            aria-label="권력 기반"
          >
            {regions.powerBase}
          </section>
          <section className="hybrid-country-panel__slot hybrid-country-panel__slot--bottom-main politics-template__law-window">
            {regions.lawScroll}
          </section>
        </div>

        <button
          type="button"
          className="hybrid-country-panel__close politics-template__close"
          onClick={onClose}
          aria-label={closeLabel}
        />
      </div>
    </aside>
  );
}
