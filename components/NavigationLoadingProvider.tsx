"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type NavigationLoadingContextValue = {
  isLoading: boolean;
  navigate: (href: string) => void;
};

const NavigationLoadingContext =
  createContext<NavigationLoadingContextValue | null>(null);

type NavigationLoadingProviderProps = {
  children: ReactNode;
};

export function NavigationLoadingScreen() {
  return (
    <div
      className="navigation-loading-overlay"
      role="status"
      aria-atomic="true"
      aria-live="polite"
    >
      <div className="navigation-loading-panel">
        <span className="navigation-loading-spinner" aria-hidden="true" />
        <p className="navigation-loading-message">資料讀取中，請稍後</p>
        <span className="navigation-loading-progress" aria-hidden="true">
          <i />
        </span>
        <small>正在逐關比對校系；大量結果可能需要數秒。</small>
      </div>
    </div>
  );
}

export function NavigationLoadingProvider({
  children,
}: NavigationLoadingProviderProps) {
  const [isLoading, setIsLoading] = useState(false);
  const isNavigatingRef = useRef(false);
  const firstFrameRef = useRef<number | null>(null);
  const secondFrameRef = useRef<number | null>(null);
  const safetyTimeoutRef = useRef<number | null>(null);

  const clearScheduledNavigation = useCallback(() => {
    if (firstFrameRef.current !== null) {
      window.cancelAnimationFrame(firstFrameRef.current);
      firstFrameRef.current = null;
    }

    if (secondFrameRef.current !== null) {
      window.cancelAnimationFrame(secondFrameRef.current);
      secondFrameRef.current = null;
    }

    if (safetyTimeoutRef.current !== null) {
      window.clearTimeout(safetyTimeoutRef.current);
      safetyTimeoutRef.current = null;
    }
  }, []);

  const resetNavigation = useCallback(() => {
    clearScheduledNavigation();
    isNavigatingRef.current = false;
    setIsLoading(false);
  }, [clearScheduledNavigation]);

  const navigate = useCallback(
    (href: string) => {
      if (isNavigatingRef.current) {
        return;
      }

      isNavigatingRef.current = true;
      setIsLoading(true);

      safetyTimeoutRef.current = window.setTimeout(resetNavigation, 15_000);
      firstFrameRef.current = window.requestAnimationFrame(() => {
        firstFrameRef.current = null;
        secondFrameRef.current = window.requestAnimationFrame(() => {
          secondFrameRef.current = null;

          try {
            window.location.assign(href);
          } catch {
            resetNavigation();
          }
        });
      });
    },
    [resetNavigation],
  );

  useEffect(() => {
    const handlePageShow = () => {
      resetNavigation();
    };

    window.addEventListener("pageshow", handlePageShow);

    return () => {
      window.removeEventListener("pageshow", handlePageShow);
      clearScheduledNavigation();
    };
  }, [clearScheduledNavigation, resetNavigation]);

  return (
    <NavigationLoadingContext.Provider value={{ isLoading, navigate }}>
      {children}
      {isLoading ? <NavigationLoadingScreen /> : null}
    </NavigationLoadingContext.Provider>
  );
}

export function useNavigationLoading() {
  const context = useContext(NavigationLoadingContext);

  if (context === null) {
    throw new Error(
      "useNavigationLoading must be used within NavigationLoadingProvider",
    );
  }

  return context;
}
