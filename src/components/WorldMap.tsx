import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { capitalsToMarkers, initialMapCapitals } from "../data/mapCapitals";
import { fetchHostileCountryKeys } from "../features/military/mapConflictUtils";
import { mapCountries } from "../data/mapCountries";
import { mapCountryComponents } from "../data/mapCountryComponents";
import { mapCountryLabels } from "../data/mapCountryLabels";
import type { MapMode } from "../types/faction";
import type {
  ImagePoint,
  MapCamera,
  MapCountryComponent,
  MapCountryIndex,
  MapCountryLabel,
  ViewportSize,
} from "../types/mapCountry";
import type { MapMarker } from "../types/mapMarker";
import {
  createFactionMapLayer,
  createFactionMapLabels,
  getFactionMembershipLabel,
} from "../utils/factionMapUtils";
import {
  cameraForWorldAnchor,
  getFitScale,
  normalizeCamera,
  screenPointToWorldPoint,
  shortestWrappedDelta,
  zoomCameraAtPoint,
} from "../utils/mapCameraUtils";
import { loadMapAssets, type LoadedMapAssets } from "../utils/mapAssetLoader";
import {
  getCachedMapImage,
  getFlagTerritoryOverlay,
} from "../utils/flagOverlayRenderer";
import {
  findComponentForPoint,
  readDominantMapId,
} from "../utils/mapSelectionUtils";
import {
  drawMapLabels,
  layoutMapLabels,
} from "../utils/mapLabelRenderer";
import {
  drawMapMarkers,
  projectMapMarkers,
} from "../utils/mapMarkerUtils";
import {
  drawDimmedWorldOverlay,
  drawMapThemeOverlay,
  getDimmedWorldFilter,
  getFallbackTerritoryOverlay,
  getMaskedTerritoryLayer,
  getSelectedGroupRim,
  resolvePresentationComponents,
  selectionPresentationConfig,
} from "../utils/selectionPresentationRenderer";
import {
  createMapSteelBackdropLayer,
} from "../utils/mapBackdropRenderer";

export type WorldMapHandle = {
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
};

type WorldMapProps = {
  mapMode: MapMode;
  showProvinceBorders: boolean;
  showLabels: boolean;
  showCapitalLabels: boolean;
  selectedCountry: MapCountryIndex | null;
  selectedComponent: MapCountryComponent | null;
  onCountrySelect: (
    country: MapCountryIndex,
    component: MapCountryComponent,
  ) => void;
};

type PointerPosition = {
  x: number;
  y: number;
};

type HoveredMapCountry = {
  country: MapCountryIndex;
  x: number;
  y: number;
};

type DragGesture = {
  pointerId: number;
  start: PointerPosition;
  last: PointerPosition;
  startedAt: number;
  maximumDistance: number;
};

type PinchGesture = {
  startDistance: number;
  anchorWorld: ImagePoint;
  startCamera: MapCamera;
};

type SelectionPresentationState = {
  country: MapCountryIndex | null;
  component: MapCountryComponent | null;
  progress: number;
  target: 0 | 1;
  lastTimestamp: number | null;
};

type MapOverlayView = {
  camera: MapCamera;
  viewport: ViewportSize;
  mapWidth: number;
  fitScale: number;
};

const CLICK_MOVEMENT_LIMIT = 8;
const CLICK_DURATION_LIMIT = 700;
const CAMERA_ANIMATION_DURATION = 460;

function easeOutCubic(progress: number): number {
  return 1 - (1 - progress) ** 3;
}

function pointerDistance(
  first: PointerPosition,
  second: PointerPosition,
): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function pointerCenter(
  first: PointerPosition,
  second: PointerPosition,
): PointerPosition {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  };
}

export const WorldMap = forwardRef<WorldMapHandle, WorldMapProps>(
  function WorldMap(
    {
      mapMode,
      showProvinceBorders,
      showLabels,
      showCapitalLabels,
      selectedCountry,
      selectedComponent,
      onCountrySelect,
    },
    forwardedRef,
  ) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const labelCanvasRef = useRef<HTMLCanvasElement>(null);
    const assetsRef = useRef<LoadedMapAssets | null>(null);
    const steelBackdropLayerRef = useRef<HTMLCanvasElement | null>(null);
    const factionMapLayerRef = useRef<HTMLCanvasElement | null>(null);
    const factionMapLabelsRef = useRef<readonly MapCountryLabel[]>([]);
    const viewportRef = useRef<ViewportSize>({ width: 1, height: 1 });
    const cameraRef = useRef<MapCamera>({ x: 0, y: 0, scale: 1 });
    const fitScaleRef = useRef(1);
    const initializedRef = useRef(false);
    const drawFrameRef = useRef<number | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const presentationFrameRef = useRef<number | null>(null);
    const presentationRef = useRef<SelectionPresentationState>({
      country: null,
      component: null,
      progress: 0,
      target: 0,
      lastTimestamp: null,
    });
    const pointersRef = useRef(new Map<number, PointerPosition>());
    const dragGestureRef = useRef<DragGesture | null>(null);
    const pinchGestureRef = useRef<PinchGesture | null>(null);
    const hadMultiplePointersRef = useRef(false);
    const selectedCountryRef = useRef(selectedCountry);
    const selectedComponentRef = useRef(selectedComponent);
    const showProvinceBordersRef = useRef(showProvinceBorders);
    const showLabelsRef = useRef(showLabels);
    const showCapitalLabelsRef = useRef(showCapitalLabels);
    const mapModeRef = useRef(mapMode);
    const hostileCountryKeysRef = useRef<ReadonlySet<string>>(new Set());
    const selectionKeyRef = useRef<string | null>(
      selectedCountry?.key ?? null,
    );
    const [isDragging, setIsDragging] = useState(false);
    const [assetError, setAssetError] = useState<string | null>(null);
    const [hoveredMapCountry, setHoveredMapCountry] =
      useState<HoveredMapCountry | null>(null);
    const [hostileCountryKeys, setHostileCountryKeys] =
      useState<ReadonlySet<string>>(() => new Set());
    const [overlayView, setOverlayView] = useState<MapOverlayView | null>(null);
    const mapMarkers = useMemo(
      () => capitalsToMarkers(initialMapCapitals),
      [],
    );

    const screenMarkers = useMemo(() => {
      if (!overlayView || mapMode !== "political") return [];
      return projectMapMarkers({
        markers: mapMarkers,
        ...overlayView,
        selectedCountryKey: selectedCountry?.key ?? null,
        mobile: overlayView.viewport.width <= 720,
      });
    }, [
      mapMarkers,
      mapMode,
      overlayView,
      selectedCountry?.key,
    ]);

    const drawMap = useCallback(() => {
      drawFrameRef.current = null;
      const canvas = canvasRef.current;
      const labelCanvas = labelCanvasRef.current;
      const assets = assetsRef.current;
      if (!canvas || !assets) {
        return;
      }
      const context = canvas.getContext("2d");
      if (!context) {
        return;
      }
      const labelContext = labelCanvas?.getContext("2d") ?? null;

      const viewport = viewportRef.current;
      const camera = cameraRef.current;
      const pixelRatio = window.devicePixelRatio || 1;
      const mapWidth = assets.width;
      const mapHeight = assets.height;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      if (labelContext && labelCanvas) {
        labelContext.setTransform(1, 0, 0, 1, 0, 0);
        labelContext.clearRect(0, 0, labelCanvas.width, labelCanvas.height);
      }
      const steelBackdrop = steelBackdropLayerRef.current;
      if (steelBackdrop) {
        context.drawImage(
          steelBackdrop,
          0,
          0,
          viewport.width,
          viewport.height,
        );
      } else {
        context.fillStyle = "#080d11";
        context.fillRect(0, 0, viewport.width, viewport.height);
      }
      context.imageSmoothingEnabled = camera.scale < 0.9;
      context.imageSmoothingQuality = "high";

      const drawWorldLayer = (
        image: CanvasImageSource,
        worldX: number,
        worldY: number,
        width: number,
        height: number,
        opacity = 1,
        filter = "none",
        compositeOperation: GlobalCompositeOperation = "source-over",
      ) => {
        context.save();
        context.globalAlpha = opacity;
        context.filter = filter;
        context.globalCompositeOperation = compositeOperation;
        for (let copy = -1; copy <= 1; copy += 1) {
          const translateX =
            viewport.width / 2 -
            camera.x * camera.scale +
            copy * mapWidth * camera.scale;
          const translateY =
            viewport.height / 2 - camera.y * camera.scale;
          context.setTransform(
            pixelRatio * camera.scale,
            0,
            0,
            pixelRatio * camera.scale,
            pixelRatio * translateX,
            pixelRatio * translateY,
          );
          context.drawImage(image, worldX, worldY, width, height);
        }
        context.restore();
      };

      const presentation = presentationRef.current;
      const progress = presentation.progress;
      const country = presentation.country;
      const component = presentation.component;
      const worldFilter = getDimmedWorldFilter(progress);
      const lineLayer = showProvinceBordersRef.current
        ? assets.provinceLines
        : assets.countryLines;
      const fillLayer =
        mapModeRef.current === "faction" && factionMapLayerRef.current
          ? factionMapLayerRef.current
          : assets.fill;

      drawWorldLayer(
        fillLayer,
        0,
        0,
        mapWidth,
        mapHeight,
        1,
        worldFilter,
      );
      drawWorldLayer(
        lineLayer,
        0,
        0,
        mapWidth,
        mapHeight,
        1,
        worldFilter,
      );
      drawMapThemeOverlay(context, viewport, pixelRatio);
      drawDimmedWorldOverlay(context, viewport, pixelRatio, progress);

      if (country && component && progress > 0) {
        const requestRedraw = () => {
          if (drawFrameRef.current === null) {
            drawFrameRef.current = requestAnimationFrame(drawMap);
          }
        };
        const presentationComponents = resolvePresentationComponents(
          country,
          component,
          mapCountryComponents,
        );
        for (const presentationComponent of presentationComponents) {
          const mask = getCachedMapImage(
            presentationComponent.maskPath,
            requestRedraw,
          );
          if (!mask) {
            continue;
          }
          const restoredTerritory = getMaskedTerritoryLayer(
            fillLayer,
            presentationComponent,
            mask,
            "selected-fill",
          );
          if (restoredTerritory) {
            drawWorldLayer(
              restoredTerritory,
              presentationComponent.bounds.x,
              presentationComponent.bounds.y,
              presentationComponent.bounds.width,
              presentationComponent.bounds.height,
              progress,
            );
          }
          const fallbackOverlay = country.flagPath
            ? getFallbackTerritoryOverlay(presentationComponent, mask)
            : null;
          const flagOverlay = getFlagTerritoryOverlay(
            country,
            presentationComponent,
            mask,
            requestRedraw,
          );
          if (flagOverlay) {
            if (fallbackOverlay) {
              drawWorldLayer(
                fallbackOverlay,
                presentationComponent.bounds.x,
                presentationComponent.bounds.y,
                presentationComponent.bounds.width,
                presentationComponent.bounds.height,
                0.28 * progress,
              );
            }
            drawWorldLayer(
              flagOverlay,
              presentationComponent.bounds.x,
              presentationComponent.bounds.y,
              presentationComponent.bounds.width,
              presentationComponent.bounds.height,
              country.flagOpacity * progress,
              "none",
              country.flagBlendMode,
            );
          }
          const selectedLines = getMaskedTerritoryLayer(
            lineLayer,
            presentationComponent,
            mask,
            showProvinceBordersRef.current
              ? "selected-province-lines"
              : "selected-country-lines",
          );
          if (selectedLines) {
            drawWorldLayer(
              selectedLines,
              presentationComponent.bounds.x,
              presentationComponent.bounds.y,
              presentationComponent.bounds.width,
              presentationComponent.bounds.height,
              progress,
            );
          }
          const rim = getSelectedGroupRim(presentationComponent, mask);
          if (rim) {
            drawWorldLayer(
              rim,
              presentationComponent.bounds.x,
              presentationComponent.bounds.y,
              presentationComponent.bounds.width,
              presentationComponent.bounds.height,
              selectionPresentationConfig.rimOpacity * progress,
            );
          }
        }
      }

      if (showLabelsRef.current && labelContext) {
        const labelPlacements = layoutMapLabels({
          labels:
            mapModeRef.current === "faction"
              ? factionMapLabelsRef.current
              : mapCountryLabels,
          camera,
          viewport,
          mapWidth,
          fitScale: fitScaleRef.current,
          selectedCountryId:
            mapModeRef.current === "faction" ? null : country?.id ?? null,
          selectedComponentId:
            mapModeRef.current === "faction"
              ? null
              : component?.componentId ?? null,
        });
        // 국명은 지도 지오메트리와 분리된 screen-space 캔버스에 그린다.
        // 카메라 줌은 글자의 위치에만 반영되고 글꼴 픽셀 크기에는 영향을 주지 않는다.
        drawMapLabels(labelContext, labelPlacements, pixelRatio, progress);
      }

      if (mapModeRef.current === "political") {
        const projectedMarkers = projectMapMarkers({
          markers: mapMarkers,
          camera,
          viewport,
          mapWidth,
          fitScale: fitScaleRef.current,
          selectedCountryKey: selectedCountryRef.current?.key ?? null,
          mobile: viewport.width <= 720,
        });
        drawMapMarkers(context, projectedMarkers, pixelRatio, {
          selectedCountryKey: selectedCountryRef.current?.key ?? null,
          hostileCountryKeys: hostileCountryKeysRef.current,
          showLabels: showCapitalLabelsRef.current,
        });
      }
    }, [mapMarkers]);

    const requestDraw = useCallback(() => {
      if (drawFrameRef.current === null) {
        drawFrameRef.current = requestAnimationFrame(drawMap);
      }
    }, [drawMap]);

    const publishOverlayView = useCallback(() => {
      const assets = assetsRef.current;
      if (!assets) return;
      setOverlayView({
        camera: { ...cameraRef.current },
        viewport: { ...viewportRef.current },
        mapWidth: assets.width,
        fitScale: fitScaleRef.current,
      });
    }, []);

    const animateSelectionPresentation = useCallback(() => {
      if (presentationFrameRef.current !== null) {
        cancelAnimationFrame(presentationFrameRef.current);
        presentationFrameRef.current = null;
      }
      const state = presentationRef.current;
      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      if (reducedMotion) {
        state.progress = state.target;
        state.lastTimestamp = null;
        if (state.target === 0) {
          state.country = null;
          state.component = null;
        }
        requestDraw();
        return;
      }

      state.lastTimestamp = null;
      const tick = (timestamp: number) => {
        const current = presentationRef.current;
        const previousTimestamp = current.lastTimestamp ?? timestamp;
        const elapsed = Math.max(0, timestamp - previousTimestamp);
        current.lastTimestamp = timestamp;
        const duration =
          current.target === 1
            ? selectionPresentationConfig.fadeInDuration
            : selectionPresentationConfig.fadeOutDuration;
        const direction = current.target === 1 ? 1 : -1;
        current.progress = Math.max(
          0,
          Math.min(1, current.progress + direction * (elapsed / duration)),
        );
        requestDraw();

        if (current.progress !== current.target) {
          presentationFrameRef.current = requestAnimationFrame(tick);
          return;
        }
        presentationFrameRef.current = null;
        current.lastTimestamp = null;
        if (current.target === 0) {
          current.country = null;
          current.component = null;
        }
      };
      presentationFrameRef.current = requestAnimationFrame(tick);
    }, [requestDraw]);

    const cancelCameraAnimation = useCallback(() => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    }, []);

    const cancelAllCameraMotion = useCallback(() => {
      cancelCameraAnimation();
    }, [cancelCameraAnimation]);

    const setCamera = useCallback(
      (camera: MapCamera) => {
        const assets = assetsRef.current;
        if (!assets) {
          return;
        }
        cameraRef.current = normalizeCamera(
          camera,
          viewportRef.current,
          { width: assets.width, height: assets.height },
          fitScaleRef.current,
        );
        publishOverlayView();
        requestDraw();
      },
      [publishOverlayView, requestDraw],
    );

    const animateCamera = useCallback(
      (targetCamera: MapCamera, duration = CAMERA_ANIMATION_DURATION) => {
        const assets = assetsRef.current;
        if (!assets) {
          return;
        }
        cancelAllCameraMotion();
        const reducedMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        const target = normalizeCamera(
          targetCamera,
          viewportRef.current,
          { width: assets.width, height: assets.height },
          fitScaleRef.current,
        );
        if (reducedMotion) {
          setCamera(target);
          return;
        }

        const start = { ...cameraRef.current };
        const xDelta = shortestWrappedDelta(start.x, target.x, assets.width);
        const startedAt = performance.now();
        const tick = (now: number) => {
          const progress = Math.min(1, (now - startedAt) / duration);
          const eased = easeOutCubic(progress);
          setCamera({
            x: start.x + xDelta * eased,
            y: start.y + (target.y - start.y) * eased,
            scale: start.scale + (target.scale - start.scale) * eased,
          });
          if (progress < 1) {
            animationFrameRef.current = requestAnimationFrame(tick);
          } else {
            animationFrameRef.current = null;
          }
        };
        animationFrameRef.current = requestAnimationFrame(tick);
      },
      [cancelAllCameraMotion, setCamera],
    );

    const zoomBy = useCallback(
      (factor: number) => {
        const assets = assetsRef.current;
        if (!assets) {
          return;
        }
        cancelAllCameraMotion();
        const viewport = viewportRef.current;
        setCamera(
          zoomCameraAtPoint(
            cameraRef.current,
            { x: viewport.width / 2, y: viewport.height / 2 },
            cameraRef.current.scale * factor,
            viewport,
            { width: assets.width, height: assets.height },
            fitScaleRef.current,
          ),
        );
      },
      [cancelAllCameraMotion, setCamera],
    );

    const resetView = useCallback(() => {
      const assets = assetsRef.current;
      if (!assets) {
        return;
      }
      animateCamera({
        x: assets.width / 2,
        y: assets.height / 2,
        scale: fitScaleRef.current,
      });
    }, [animateCamera]);

    useImperativeHandle(
      forwardedRef,
      () => ({
        zoomIn: () => zoomBy(1.3),
        zoomOut: () => zoomBy(1 / 1.3),
        resetView,
      }),
      [resetView, zoomBy],
    );

    const focusComponent = useCallback(
      (component: MapCountryComponent) => {
        const assets = assetsRef.current;
        if (!assets) {
          return;
        }
        const viewport = viewportRef.current;
        const isMobile = window.matchMedia("(max-width: 720px)").matches;
        const panelWidth = isMobile
          ? 0
          : Math.min(430, Math.max(370, viewport.width * 0.31));
        const panelHeight = isMobile ? viewport.height * 0.54 : 0;
        const availableWidth = Math.max(160, viewport.width - panelWidth);
        const availableHeight = Math.max(120, viewport.height - panelHeight);
        const paddedWidth = Math.max(1, component.bounds.width * 1.32);
        const paddedHeight = Math.max(1, component.bounds.height * 1.32);
        const requiredScale = Math.min(
          availableWidth / paddedWidth,
          availableHeight / paddedHeight,
        );
        const current = cameraRef.current;
        const isVeryLarge =
          component.bounds.width > assets.width * 0.24 ||
          component.bounds.height > assets.height * 0.45;
        let targetScale = Math.max(current.scale, requiredScale);
        if (isVeryLarge) {
          targetScale = Math.min(
            Math.max(targetScale, current.scale * 1.18),
            current.scale * 1.45,
          );
        }
        targetScale = Math.min(
          targetScale,
          fitScaleRef.current * 16,
        );

        const visibleCenterX = panelWidth + availableWidth / 2;
        const visibleCenterY = availableHeight / 2;
        const targetX =
          component.centroid.x -
          (visibleCenterX - viewport.width / 2) / targetScale;
        const targetY =
          component.centroid.y -
          (visibleCenterY - viewport.height / 2) / targetScale;
        animateCamera({ x: targetX, y: targetY, scale: targetScale });
      },
      [animateCamera],
    );

    const findMapTarget = useCallback(
      (screenPoint: ImagePoint, radius = 2) => {
        const assets = assetsRef.current;
        if (!assets) {
          return null;
        }
        const worldPoint = screenPointToWorldPoint(
          screenPoint,
          cameraRef.current,
          viewportRef.current,
          { width: assets.width, height: assets.height },
        );
        if (!worldPoint) {
          return null;
        }
        const countryId = readDominantMapId(
          assets.idMapContext,
          worldPoint,
          { width: assets.width, height: assets.height },
          radius,
        );
        if (countryId === 0) {
          return null;
        }
        const country =
          mapCountries.find((candidate) => candidate.id === countryId) ?? null;
        const component = findComponentForPoint(
          countryId,
          worldPoint,
          mapCountryComponents,
          assets.width,
        );
        if (!country || !component) {
          return null;
        }
        return { country, component };
      },
      [],
    );

    const selectAtScreenPoint = useCallback(
      (screenPoint: ImagePoint) => {
        const target = findMapTarget(screenPoint);
        if (!target) {
          return;
        }
        const { country, component } = target;

        if (import.meta.env.DEV) {
          console.debug("[map-country]", {
            id: country.id,
            color: country.color,
            displayGroupId: component.displayGroupId,
            flagPath: country.flagPath,
            flagFocusMode: country.flagFocusMode,
            flagBlendMode: country.flagBlendMode,
            fallback: country.flagPath === null,
            dimStrength: selectionPresentationConfig.dimOpacity,
            rimStrength: selectionPresentationConfig.rimOpacity,
          });
        }
        if (selectionKeyRef.current !== country.key) {
          selectionKeyRef.current = country.key;
          focusComponent(component);
        }
        onCountrySelect(country, component);
      },
      [findMapTarget, focusComponent, onCountrySelect],
    );

    const selectMapMarker = useCallback(
      (marker: MapMarker) => {
        if (!marker.selectable) return;
        const assets = assetsRef.current;
        const country = mapCountries.find(
          (candidate) => candidate.key === marker.countryKey,
        );
        if (!assets || !country) return;
        const component = findComponentForPoint(
          country.id,
          marker.position,
          mapCountryComponents,
          assets.width,
        );
        if (!component) return;
        if (selectionKeyRef.current !== country.key) {
          selectionKeyRef.current = country.key;
          focusComponent(component);
        }
        onCountrySelect(country, component);
      },
      [focusComponent, onCountrySelect],
    );

    useEffect(() => {
      selectedCountryRef.current = selectedCountry;
      selectedComponentRef.current = selectedComponent;
      selectionKeyRef.current = selectedCountry?.key ?? null;
      const presentation = presentationRef.current;
      if (selectedCountry && selectedComponent) {
        const changedCountry =
          presentation.country?.id !== selectedCountry.id;
        presentation.country = selectedCountry;
        presentation.component = selectedComponent;
        presentation.target = 1;
        if (changedCountry && presentation.progress > 0) {
          presentation.progress = Math.min(0.46, presentation.progress);
        }
      } else {
        presentation.target = 0;
      }
      animateSelectionPresentation();
      requestDraw();
    }, [
      animateSelectionPresentation,
      requestDraw,
      selectedComponent,
      selectedCountry,
    ]);

    useEffect(() => {
      showProvinceBordersRef.current = showProvinceBorders;
      requestDraw();
    }, [requestDraw, showProvinceBorders]);

    useEffect(() => {
      showLabelsRef.current = showLabels;
      requestDraw();
    }, [requestDraw, showLabels]);

    useEffect(() => {
      showCapitalLabelsRef.current = showCapitalLabels;
      requestDraw();
    }, [requestDraw, showCapitalLabels]);

    useEffect(() => {
      hostileCountryKeysRef.current = hostileCountryKeys;
      requestDraw();
    }, [hostileCountryKeys, requestDraw]);

    useEffect(() => {
      mapModeRef.current = mapMode;
      if (mapMode !== "faction") {
        setHoveredMapCountry(null);
      }
      requestDraw();
    }, [mapMode, requestDraw]);

    useEffect(() => {
      const controller = new AbortController();
      if (!selectedCountry) {
        setHostileCountryKeys(new Set());
        return () => controller.abort();
      }

      setHostileCountryKeys(new Set());
      void fetchHostileCountryKeys(selectedCountry.key, controller.signal)
        .then((countryKeys) => {
          if (!controller.signal.aborted) setHostileCountryKeys(countryKeys);
        })
        .catch(() => {
          if (!controller.signal.aborted) setHostileCountryKeys(new Set());
        });
      return () => controller.abort();
    }, [selectedCountry]);

    useEffect(() => {
      let active = true;
      loadMapAssets()
        .then((assets) => {
          if (!active) {
            return;
          }
          assetsRef.current = assets;
          factionMapLayerRef.current = createFactionMapLayer(
            assets.fill,
            assets.idMapContext,
            { width: assets.width, height: assets.height },
            mapCountries,
          );
          factionMapLabelsRef.current = createFactionMapLabels(
            mapCountryLabels,
            mapCountries,
            assets.width,
          );
          setAssetError(null);
          const viewport = viewportRef.current;
          const fitScale = getFitScale(viewport, {
            width: assets.width,
            height: assets.height,
          });
          fitScaleRef.current = fitScale;
          cameraRef.current = {
            x: assets.width / 2,
            y: assets.height / 2,
            scale: fitScale,
          };
          initializedRef.current = true;
          publishOverlayView();
          requestDraw();
        })
        .catch((error: unknown) => {
          if (active) {
            setAssetError(
              error instanceof Error
                ? error.message
                : "지도 에셋을 불러오지 못했습니다.",
            );
          }
        });

      return () => {
        active = false;
        assetsRef.current = null;
        steelBackdropLayerRef.current = null;
        factionMapLayerRef.current = null;
        factionMapLabelsRef.current = [];
      };
    }, [publishOverlayView, requestDraw]);

    useEffect(() => {
      const canvas = canvasRef.current;
      const labelCanvas = labelCanvasRef.current;
      if (!canvas || !labelCanvas) {
        return;
      }

      const resize = () => {
        const bounds = canvas.getBoundingClientRect();
        const nextViewport = {
          width: Math.max(1, bounds.width),
          height: Math.max(1, bounds.height),
        };
        const pixelRatio = window.devicePixelRatio || 1;
        canvas.width = Math.max(1, Math.round(nextViewport.width * pixelRatio));
        canvas.height = Math.max(
          1,
          Math.round(nextViewport.height * pixelRatio),
        );
        labelCanvas.width = canvas.width;
        labelCanvas.height = canvas.height;
        steelBackdropLayerRef.current = createMapSteelBackdropLayer(
          nextViewport.width * pixelRatio,
          nextViewport.height * pixelRatio,
        );
        const assets = assetsRef.current;
        const previousFit = fitScaleRef.current;
        viewportRef.current = nextViewport;
        if (assets) {
          const nextFit = getFitScale(nextViewport, {
            width: assets.width,
            height: assets.height,
          });
          fitScaleRef.current = nextFit;
          if (initializedRef.current) {
            const zoomRatio = cameraRef.current.scale / previousFit;
            cameraRef.current = normalizeCamera(
              { ...cameraRef.current, scale: nextFit * zoomRatio },
              nextViewport,
              { width: assets.width, height: assets.height },
              nextFit,
            );
          }
          publishOverlayView();
        }
        requestDraw();
      };

      resize();
      const observer = new ResizeObserver(resize);
      observer.observe(canvas);
      return () => observer.disconnect();
    }, [publishOverlayView, requestDraw]);

    useEffect(
      () => () => {
        cancelAllCameraMotion();
        if (presentationFrameRef.current !== null) {
          cancelAnimationFrame(presentationFrameRef.current);
          presentationFrameRef.current = null;
        }
        if (drawFrameRef.current !== null) {
          cancelAnimationFrame(drawFrameRef.current);
          drawFrameRef.current = null;
        }
      },
      [cancelAllCameraMotion],
    );

    const relativePointer = (
      event: ReactPointerEvent<HTMLCanvasElement>,
    ): PointerPosition => {
      const bounds = event.currentTarget.getBoundingClientRect();
      return {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      };
    };

    const beginPinch = () => {
      const positions = [...pointersRef.current.values()];
      if (positions.length < 2) {
        return;
      }
      const center = pointerCenter(positions[0], positions[1]);
      const camera = { ...cameraRef.current };
      pinchGestureRef.current = {
        startDistance: Math.max(
          1,
          pointerDistance(positions[0], positions[1]),
        ),
        anchorWorld: {
          x:
            camera.x +
            (center.x - viewportRef.current.width / 2) / camera.scale,
          y:
            camera.y +
            (center.y - viewportRef.current.height / 2) / camera.scale,
        },
        startCamera: camera,
      };
    };

    const handlePointerDown = (
      event: ReactPointerEvent<HTMLCanvasElement>,
    ) => {
      if (event.button !== 0) {
        return;
      }
      setHoveredMapCountry(null);
      cancelAllCameraMotion();
      event.currentTarget.setPointerCapture(event.pointerId);
      const point = relativePointer(event);
      pointersRef.current.set(event.pointerId, point);
      if (pointersRef.current.size === 1) {
        dragGestureRef.current = {
          pointerId: event.pointerId,
          start: point,
          last: point,
          startedAt: performance.now(),
          maximumDistance: 0,
        };
        setIsDragging(true);
      } else {
        hadMultiplePointersRef.current = true;
        dragGestureRef.current = null;
        beginPinch();
      }
    };

    const handlePointerMove = (
      event: ReactPointerEvent<HTMLCanvasElement>,
    ) => {
      if (!pointersRef.current.has(event.pointerId)) {
        if (mapModeRef.current !== "faction") {
          return;
        }
        const point = relativePointer(event);
        const target = findMapTarget(point, 1);
        if (!target) {
          setHoveredMapCountry(null);
          return;
        }
        const viewport = viewportRef.current;
        setHoveredMapCountry({
          country: target.country,
          x: Math.min(point.x + 14, Math.max(8, viewport.width - 220)),
          y: Math.min(point.y + 14, Math.max(8, viewport.height - 66)),
        });
        return;
      }
      setHoveredMapCountry(null);
      event.preventDefault();
      const point = relativePointer(event);
      pointersRef.current.set(event.pointerId, point);
      const assets = assetsRef.current;
      if (!assets) {
        return;
      }

      if (pointersRef.current.size >= 2 && pinchGestureRef.current) {
        const positions = [...pointersRef.current.values()];
        const center = pointerCenter(positions[0], positions[1]);
        const distance = Math.max(
          1,
          pointerDistance(positions[0], positions[1]),
        );
        const pinch = pinchGestureRef.current;
        const scale =
          pinch.startCamera.scale * (distance / pinch.startDistance);
        setCamera(
          cameraForWorldAnchor(
            pinch.anchorWorld,
            center,
            scale,
            viewportRef.current,
            { width: assets.width, height: assets.height },
            fitScaleRef.current,
          ),
        );
        return;
      }

      const drag = dragGestureRef.current;
      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }
      drag.maximumDistance = Math.max(
        drag.maximumDistance,
        pointerDistance(drag.start, point),
      );
      const deltaX = point.x - drag.last.x;
      const deltaY = point.y - drag.last.y;
      drag.last = point;
      setCamera({
        x: cameraRef.current.x - deltaX / cameraRef.current.scale,
        y: cameraRef.current.y - deltaY / cameraRef.current.scale,
        scale: cameraRef.current.scale,
      });
    };

    const finishPointer = (
      event: ReactPointerEvent<HTMLCanvasElement>,
      allowSelection: boolean,
    ) => {
      if (!pointersRef.current.has(event.pointerId)) {
        return;
      }
      const point = relativePointer(event);
      const drag = dragGestureRef.current;
      const shouldSelect =
        allowSelection &&
        pointersRef.current.size === 1 &&
        !hadMultiplePointersRef.current &&
        drag?.pointerId === event.pointerId &&
        Math.max(drag.maximumDistance, pointerDistance(drag.start, point)) <=
          CLICK_MOVEMENT_LIMIT &&
        performance.now() - drag.startedAt <= CLICK_DURATION_LIMIT;

      pointersRef.current.delete(event.pointerId);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      pinchGestureRef.current = null;
      dragGestureRef.current = null;

      if (pointersRef.current.size === 1) {
        const [remainingId, remainingPoint] = [
          ...pointersRef.current.entries(),
        ][0];
        dragGestureRef.current = {
          pointerId: remainingId,
          start: remainingPoint,
          last: remainingPoint,
          startedAt: performance.now(),
          maximumDistance: 0,
        };
      } else if (pointersRef.current.size === 0) {
        hadMultiplePointersRef.current = false;
        setIsDragging(false);
      }

      if (shouldSelect) {
        selectAtScreenPoint(point);
      }
    };

    const handleWheel = (event: ReactWheelEvent<HTMLCanvasElement>) => {
      event.preventDefault();
      const assets = assetsRef.current;
      if (!assets) {
        return;
      }
      cancelCameraAnimation();
      const bounds = event.currentTarget.getBoundingClientRect();
      const point = {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      };
      const factor = Math.exp(-event.deltaY * 0.0015);
      setCamera(
        zoomCameraAtPoint(
          cameraRef.current,
          point,
          cameraRef.current.scale * factor,
          viewportRef.current,
          { width: assets.width, height: assets.height },
          fitScaleRef.current,
        ),
      );
    };

    return (
      <div className="world-map-container">
        <canvas
          ref={canvasRef}
          className="world-map"
          data-dragging={isDragging}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={(event) => finishPointer(event, true)}
          onPointerCancel={(event) => finishPointer(event, false)}
          onPointerLeave={() => setHoveredMapCountry(null)}
          onWheel={handleWheel}
          onDoubleClick={(event) => event.preventDefault()}
          onContextMenu={(event) => event.preventDefault()}
          aria-label="확대, 이동, 국가 선택이 가능한 1932년 세계지도"
          role="img"
        />
        <canvas
          ref={labelCanvasRef}
          className="world-map-labels"
          aria-hidden="true"
        />
        <div className="map-marker-layer" aria-label="지도 전략 마커">
          {screenMarkers.map((screenMarker) => {
            const selected =
              screenMarker.marker.countryKey === selectedCountry?.key;
            const hostile =
              !selected &&
              hostileCountryKeys.has(screenMarker.marker.countryKey);
            return (
              <button
                key={`${screenMarker.marker.id}:${screenMarker.copy}`}
                type="button"
                className={`map-marker map-marker--capital map-marker--hit-target${
                  selected ? " map-marker--selected" : ""
                }${hostile ? " map-marker--hostile" : ""}`}
                data-map-marker-type={screenMarker.marker.type}
                data-map-marker-id={screenMarker.marker.id}
                style={{
                  left: screenMarker.x,
                  top: screenMarker.y,
                  width: screenMarker.size,
                  height: screenMarker.size,
                }}
                onClick={() => selectMapMarker(screenMarker.marker)}
                aria-label={`${screenMarker.marker.name} 수도 선택`}
                title={screenMarker.marker.name}
              />
            );
          })}
        </div>
        {mapMode === "faction" && hoveredMapCountry ? (
          <div
            className="map-hover-tooltip"
            style={{
              left: hoveredMapCountry.x,
              top: hoveredMapCountry.y,
            }}
            role="tooltip"
          >
            <strong>{hoveredMapCountry.country.name}</strong>
            <span>
              {getFactionMembershipLabel(hoveredMapCountry.country)}
            </span>
          </div>
        ) : null}
        {assetError && (
          <p className="map-error" role="alert">
            {assetError}
          </p>
        )}
      </div>
    );
  },
);
