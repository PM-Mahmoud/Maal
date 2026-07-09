/**
 * Supabase-compatible API adapter.
 * Replaces @supabase/supabase-js and @lovable.dev/cloud-auth-js
 * with calls to our Express/Neon backend.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface ApiUser {
  id: string;
  email: string;
  name?: string;
}

export interface Session {
  user: ApiUser;
}

type QueryResult<T> = { data: T | null; error: { message: string } | null };
type ManyResult<T> = { data: T[]; error: { message: string } | null };

// ── Auth context ───────────────────────────────────────────────────────────

let _session: Session | null = null;
let _authListeners: Array<(event: string, session: Session | null) => void> = [];

function notifyListeners(event: string) {
  _authListeners.forEach((fn) => fn(event, _session));
}

// ── Auth ───────────────────────────────────────────────────────────────────

export const supabaseAuth = {
  async getSession(): Promise<{ data: { session: Session | null } }> {
    if (_session) return { data: { session: _session } };
    try {
      const r = await fetch("/api/me", { credentials: "include" });
      if (!r.ok) { _session = null; return { data: { session: null } }; }
      const u: ApiUser = await r.json();
      _session = { user: u };
      return { data: { session: _session } };
    } catch {
      return { data: { session: null } };
    }
  },

  async getUser(): Promise<{ data: { user: ApiUser | null } }> {
    const { data } = await supabaseAuth.getSession();
    return { data: { user: data.session?.user ?? null } };
  },

  async signInWithPassword(creds: { email: string; password: string }) {
    const r = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(creds),
    });
    const json = await r.json();
    if (!r.ok) return { data: { user: null, session: null }, error: { message: json.error || "Sign in failed" } };
    _session = { user: json.user };
    notifyListeners("SIGNED_IN");
    return { data: { user: json.user, session: _session }, error: null };
  },

  async signUp(params: { email: string; password: string; options?: unknown }) {
    const r = await fetch("/api/auth/signup", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: params.email, password: params.password }),
    });
    const json = await r.json();
    if (!r.ok) return { data: { user: null, session: null }, error: { message: json.error || "Sign up failed" } };
    _session = { user: json.user };
    notifyListeners("SIGNED_IN");
    return { data: { user: json.user, session: _session }, error: null };
  },

  async signInWithOAuth(_provider: string, _opts?: unknown) {
    window.location.href = "/auth/google";
    return { data: null, error: null };
  },

  async signOut() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    _session = null;
    notifyListeners("SIGNED_OUT");
    return { error: null };
  },

  onAuthStateChange(cb: (event: string, session: Session | null) => void) {
    _authListeners.push(cb);
    return {
      data: { subscription: { unsubscribe: () => { _authListeners = _authListeners.filter((f) => f !== cb); } } },
    };
  },
};

// ── Generic query builder ──────────────────────────────────────────────────

class QueryBuilder<T = Record<string, unknown>> {
  private _table: string;
  private _method: "GET" | "POST" | "PATCH" | "DELETE" = "GET";
  private _body: unknown = undefined;
  private _filters: string[] = [];
  private _select = "*";
  private _single = false;
  private _limit?: number;
  private _order?: string;

  constructor(table: string) {
    this._table = table;
  }

  select(cols: string) { this._select = cols; return this; }
  eq(col: string, val: unknown) { this._filters.push(`${col}=eq.${val}`); return this; }
  neq(col: string, val: unknown) { this._filters.push(`${col}=neq.${val}`); return this; }
  in(col: string, vals: unknown[]) { this._filters.push(`${col}=in.(${vals.join(",")})`); return this; }
  gte(col: string, val: unknown) { this._filters.push(`${col}=gte.${val}`); return this; }
  lte(col: string, val: unknown) { this._filters.push(`${col}=lte.${val}`); return this; }
  is(col: string, val: unknown) { this._filters.push(`${col}=is.${val}`); return this; }
  not(col: string, op: string, val: unknown) { this._filters.push(`${col}=not.${op}.${val}`); return this; }
  limit(n: number) { this._limit = n; return this; }
  order(col: string, opts?: { ascending?: boolean }) {
    this._order = `${col}.${opts?.ascending === false ? "desc" : "asc"}`;
    return this;
  }
  maybeSingle() { this._single = true; return this; }
  single() { this._single = true; return this; }

  insert(data: unknown) {
    this._method = "POST";
    this._body = data;
    return this;
  }

  upsert(data: unknown, _opts?: unknown) {
    this._method = "PATCH";
    this._body = data;
    return this;
  }

  update(data: unknown) {
    this._method = "PATCH";
    this._body = data;
    return this;
  }

  delete() {
    this._method = "DELETE";
    return this;
  }

  then(resolve: (v: QueryResult<T> | ManyResult<T>) => void, reject?: (e: unknown) => void) {
    this._execute().then(resolve, reject);
  }

  async _execute(): Promise<QueryResult<T> | ManyResult<T>> {
    const params = new URLSearchParams();
    if (this._select !== "*") params.set("select", this._select);
    this._filters.forEach((f) => params.append("filter", f));
    if (this._limit) params.set("limit", String(this._limit));
    if (this._order) params.set("order", this._order);
    if (this._single) params.set("single", "1");

    const url = `/api/v1/${this._table}?${params}`;
    try {
      const r = await fetch(url, {
        method: this._method,
        credentials: "include",
        headers: this._body ? { "Content-Type": "application/json" } : {},
        body: this._body ? JSON.stringify(this._body) : undefined,
      });
      const json = await r.json();
      if (!r.ok) return { data: this._single ? null : [], error: { message: json.error || "Request failed" } };
      return { data: json, error: null };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Network error";
      return { data: this._single ? null : [], error: { message: msg } };
    }
  }
}

// ── Supabase-compatible client export ─────────────────────────────────────

// Realtime is not supported by this Express/Neon adapter. Provide graceful no-op
// stubs so components written against Supabase realtime (e.g. NotificationBell's
// supabase.channel(...).on(...).subscribe()) don't throw "channel is not a
// function" on every app page — they simply get no live updates.
function channelStub() {
  const ch = {
    on() { return ch; },
    subscribe() { return ch; },
    unsubscribe() { return Promise.resolve("ok"); },
  };
  return ch;
}

export const supabase = {
  auth: supabaseAuth,
  from<T = Record<string, unknown>>(table: string) {
    return new QueryBuilder<T>(table);
  },
  channel(_name?: string) {
    return channelStub();
  },
  removeChannel(_channel?: unknown) {
    /* no-op — realtime not supported */
  },
};

// ── Lovable auth compat (used in auth.tsx) ────────────────────────────────

export const lovable = {
  auth: {
    async signInWithOAuth(provider: string, _opts?: unknown) {
      window.location.href = `/auth/${provider}`;
      return { redirected: true, error: null };
    },
  },
};
