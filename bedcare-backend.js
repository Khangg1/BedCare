(function () {
  function getClient() {
    const config = window.BEDCARE_SUPABASE_CONFIG;
    if (!config || !config.url || !config.anonKey) {
      throw new Error("Chưa cấu hình Supabase. Kiểm tra file supabase-config.js.");
    }
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      throw new Error("Không tải được thư viện Supabase. Kiểm tra kết nối Internet rồi tải lại trang.");
    }
    if (!window.__bedcareSupabaseClient) {
      const projectRef = new URL(config.url).hostname.split(".")[0];
      window.__bedcareSupabaseClient = window.supabase.createClient(config.url, config.anonKey, {
        auth: {
          storageKey: `sb-${projectRef}-auth-token`,
          storage: window.localStorage,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false
        }
      });
    }
    return window.__bedcareSupabaseClient;
  }

  function unwrap(result) {
    if (result.error) throw result.error;
    return result.data;
  }

  function authIdentifier(value) {
    const identifier = value.trim();
    if (identifier.includes("@")) return identifier;
    if (!/^[a-z0-9][a-z0-9._-]{2,31}$/i.test(identifier)) {
      throw new Error("Tên đăng nhập cần dài 3–32 ký tự, bắt đầu bằng chữ hoặc số; chỉ dùng chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.");
    }
    return `${identifier.toLowerCase()}@bedcare.invalid`;
  }

  function toBed(row) {
    return {
      code: row.code,
      department: row.department,
      type: row.bed_type,
      status: row.status,
      patients: row.patients,
      since: row.since || "",
      admittedAt: row.admitted_at || "",
      dischargedAt: row.discharged_at || ""
    };
  }

  function toRow(bed) {
    return {
      code: bed.code,
      department: bed.department,
      bed_type: bed.type,
      status: bed.status,
      patients: bed.patients || [],
      since: bed.since || "",
      admitted_at: bed.admittedAt || "",
      discharged_at: bed.dischargedAt || ""
    };
  }

  async function getMembership() {
    const client = getClient();
    const { user } = unwrap(await client.auth.getUser());
    if (!user) return null;
    return unwrap(await client
      .from("hospital_members")
      .select("user_id, role")
      .eq("user_id", user.id)
      .maybeSingle());
  }

  async function ensureMembership() {
    const membership = await getMembership();
    if (!membership) {
      throw new Error("Tài khoản chưa được cấp quyền sử dụng. Hãy nhờ quản trị viên thêm UUID vào hospital_members.");
    }
    return membership;
  }

  async function ensureAdmin() {
    const membership = await ensureMembership();
    if (membership.role !== "admin") {
      throw new Error("Chỉ quản trị viên mới được quản lý thành viên.");
    }
    return membership;
  }

  window.BedCareBackend = {
    getClient,
    async getSession() {
      return unwrap(await getClient().auth.getSession());
    },
    async signIn(usernameOrEmail, password) {
      return unwrap(await getClient().auth.signInWithPassword({
        email: authIdentifier(usernameOrEmail),
        password
      }));
    },
    async signUp(username, password) {
      const normalizedUsername = username.trim().toLowerCase();
      const email = authIdentifier(normalizedUsername);
      return unwrap(await getClient().auth.signUp({
        email,
        password,
        options: { data: { username: normalizedUsername } }
      }));
    },
    async signOut() {
      unwrap(await getClient().auth.signOut());
    },
    getMembership,
    async getMembers() {
      await ensureAdmin();
      return unwrap(await getClient()
        .from("hospital_members")
        .select("user_id, role, created_at")
        .order("created_at")).map(member => ({
          userId: member.user_id,
          role: member.role,
          createdAt: member.created_at
        }));
    },
    async addMember(userId) {
      await ensureAdmin();
      unwrap(await getClient()
        .from("hospital_members")
        .insert({ user_id: userId, role: "member" }));
    },
    async removeMember(userId) {
      await ensureAdmin();
      unwrap(await getClient()
        .from("hospital_members")
        .delete()
        .eq("user_id", userId)
        .eq("role", "member"));
    },
    async getBeds() {
      const client = getClient();
      await ensureMembership();
      return unwrap(await client
        .from("beds")
        .select("code, department, bed_type, status, patients, since, admitted_at, discharged_at")
        .order("code")).map(toBed);
    },
    async saveBed(bed) {
      unwrap(await getClient().from("beds").upsert(toRow(bed), { onConflict: "code" }));
    },
    async importBeds(beds) {
      const client = getClient();
      const current = await client.from("beds").select("code", { count: "exact", head: true });
      if (current.error) throw current.error;
      if (current.count > 0) {
        throw new Error("Database đã có giường. Không nhập bản sao lưu để tránh ghi đè dữ liệu đang dùng.");
      }
      unwrap(await client.from("beds").upsert(beds.map(toRow), { onConflict: "code" }));
    },
    async deleteBed(code) {
      unwrap(await getClient().from("beds").delete().eq("code", code));
    },
    subscribeToBeds(onChange, onError) {
      const client = getClient();
      const channel = client
        .channel("bedcare-live-beds")
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table: "beds"
        }, onChange)
        .subscribe(status => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            onError(new Error(`Không thể kết nối đồng bộ realtime (${status}).`));
          }
        });
      return () => client.removeChannel(channel);
    }
  };
})();
