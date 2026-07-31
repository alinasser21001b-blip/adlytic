import {
  Children,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useMemo,
  useState,
  type AnchorHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";

interface RouterValue {
  path: string;
  search: string;
  navigate: (to: string, options?: { replace?: boolean }) => void;
}

const RouterContext = createContext<RouterValue | null>(null);
const ParamsContext = createContext<Record<string, string>>({});

function currentLocation() {
  return {
    path: window.location.pathname || "/",
    search: window.location.search,
  };
}

export function BrowserRouter({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState(currentLocation);

  useEffect(() => {
    const update = () => setLocation(currentLocation());
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);

  function navigate(to: string, options?: { replace?: boolean }) {
    const target = new URL(to, window.location.origin);
    if (target.origin !== window.location.origin) {
      throw new Error("CROSS_ORIGIN_NAVIGATION_REJECTED");
    }
    if (options?.replace) {
      window.history.replaceState({}, "", `${target.pathname}${target.search}${target.hash}`);
    } else {
      window.history.pushState({}, "", `${target.pathname}${target.search}${target.hash}`);
    }
    setLocation(currentLocation());
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  const value = useMemo(
    () => ({ ...location, navigate }),
    [location.path, location.search],
  );
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

function useRouter() {
  const router = useContext(RouterContext);
  if (!router) throw new Error("BROWSER_ROUTER_REQUIRED");
  return router;
}

export function useNavigate() {
  return useRouter().navigate;
}

export function useParams<T extends Record<string, string | undefined>>() {
  return useContext(ParamsContext) as T;
}

export function useSearchParams(): [
  URLSearchParams,
  (value: URLSearchParams | Record<string, string>) => void,
] {
  const router = useRouter();
  const params = useMemo(() => new URLSearchParams(router.search), [router.search]);
  function setParams(value: URLSearchParams | Record<string, string>) {
    const next =
      value instanceof URLSearchParams ? value : new URLSearchParams(value);
    router.navigate(`${router.path}?${next.toString()}`, { replace: true });
  }
  return [params, setParams];
}

interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  to: string;
}

export function Link({ to, onClick, ...props }: LinkProps) {
  const router = useRouter();
  return (
    <a
      {...props}
      href={to}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          props.target === "_blank"
        ) {
          return;
        }
        event.preventDefault();
        router.navigate(to);
      }}
    />
  );
}

export function NavLink({
  to,
  end,
  className,
  ...props
}: LinkProps & { end?: boolean }) {
  const router = useRouter();
  const active = end
    ? router.path === to
    : router.path === to || router.path.startsWith(`${to}/`);
  const resolvedClassName = [className, active ? "active" : ""]
    .filter(Boolean)
    .join(" ");
  return <Link {...props} to={to} className={resolvedClassName} />;
}

export function Navigate({
  to,
  replace,
}: {
  to: string;
  replace?: boolean;
}) {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(to, { replace });
  }, [to, replace]);
  return null;
}

interface RouteProps {
  path: string;
  element: ReactNode;
}

export function Route(_props: RouteProps) {
  return null;
}

function matchPath(pattern: string, pathname: string) {
  if (pattern === "*") return { matched: true, params: {} };
  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = pathname.split("/").filter(Boolean);
  if (patternParts.length !== pathParts.length) {
    return { matched: false, params: {} };
  }
  const params: Record<string, string> = {};
  for (let index = 0; index < patternParts.length; index += 1) {
    const patternPart = patternParts[index];
    const pathPart = pathParts[index];
    if (patternPart.startsWith(":")) {
      params[patternPart.slice(1)] = decodeURIComponent(pathPart);
    } else if (patternPart !== pathPart) {
      return { matched: false, params: {} };
    }
  }
  return { matched: true, params };
}

export function Routes({ children }: { children: ReactNode }) {
  const router = useRouter();
  for (const child of Children.toArray(children)) {
    if (!isValidElement(child)) continue;
    const route = child as ReactElement<RouteProps>;
    const match = matchPath(route.props.path, router.path);
    if (match.matched) {
      return (
        <ParamsContext.Provider value={match.params}>
          {route.props.element}
        </ParamsContext.Provider>
      );
    }
  }
  return null;
}
