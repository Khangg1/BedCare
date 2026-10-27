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
      room: row.room || "",
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
      department: bed.department === "Liên Chuyên Khoa" ? "LCK" : bed.department,
      room: bed.room || "",
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
      .select("user_id, role, department")
      .eq("user_id", user.id)
      .maybeSingle());
  }

  async function ensureMembership() {
    const membership = await getMembership();
    if (!membership) {
      throw new Error("Tài khoản chưa được cấp quyền sử dụng. Hãy nhờ quản trị viên thêm UUID vào hospital_members.");
    }
    if (membership.role === "member" && !membership.department) {
      throw new Error("Tài khoản chưa được gán khoa. Hãy nhờ admin chọn khoa cho tài khoản trong mục Cài đặt.");
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
        .select("user_id, role, department, created_at")
        .order("created_at")).map(member => ({
          userId: member.user_id,
          role: member.role,
          department: member.department,
          createdAt: member.created_at
        }));
    },
    async addMember(userId, role, department) {
      await ensureAdmin();
      unwrap(await getClient()
        .from("hospital_members")
        .insert({ user_id: userId, role, department: role === "admin" ? null : department }));
    },
    async updateMemberAccess(userId, role, department) {
      const membership = await ensureAdmin();
      const updated = unwrap(await getClient()
        .from("hospital_members")
        .update({ role, department: role === "admin" ? null : department })
        .eq("user_id", userId)
        .neq("user_id", membership.user_id)
        .select("user_id")
        .maybeSingle());
      if (!updated) throw new Error("Không tìm thấy tài khoản hoặc bạn không được phép đổi quyền tài khoản đang đăng nhập.");
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
        .select("code, department, room, bed_type, status, patients, since, admitted_at, discharged_at")
        .order("code")).map(toBed);
    },
    async getAdmissions() {
      await ensureMembership();
      return unwrap(await getClient()
        .from("patient_admissions")
        .select("id, bed_code, department, room, patient_name, admitted_at, discharged_at")
        .order("admitted_at", { ascending: false })).map(admission => ({
        id: admission.id,
        bedCode: admission.bed_code,
        department: admission.department,
        room: admission.room || "",
        patientName: admission.patient_name,
        admittedAt: admission.admitted_at,
        dischargedAt: admission.discharged_at
      }));
    },
    async importPatientAdmissions(admissions) {
      await ensureAdmin();
      if (!Array.isArray(admissions) || admissions.length === 0) {
        throw new Error("Không có dòng dữ liệu hợp lệ để nhập.");
      }
      const allowedDepartments = ["LCK", "Nội", "Ngoại", "Đông Y", "Cấp Cứu"];
      const rows = admissions.map((admission, index) => {
        const patientName = typeof admission.patientName === "string" ? admission.patientName.trim() : "";
        const bedCode = typeof admission.bedCode === "string" ? admission.bedCode.trim() : "";
        const room = typeof admission.room === "string" ? admission.room.trim() : "";
        const admittedAt = new Date(admission.admittedAt);
        const dischargedAt = admission.dischargedAt ? new Date(admission.dischargedAt) : null;
        if (!patientName || !bedCode || !allowedDepartments.includes(admission.department) ||
            Number.isNaN(admittedAt.getTime()) ||
            (dischargedAt && (Number.isNaN(dischargedAt.getTime()) || dischargedAt < admittedAt))) {
          throw new Error(`Dòng ${index + 1} có tên bệnh nhân, giường, khoa hoặc ngày vào/ra không hợp lệ.`);
        }
        return {
          department: admission.department,
          room,
          bed_code: bedCode,
          patient_name: patientName,
          admitted_at: admittedAt.toISOString(),
          discharged_at: dischargedAt ? dischargedAt.toISOString() : null
        };
      });
      const client = getClient();
      for (let offset = 0; offset < rows.length; offset += 500) {
        const batch = rows.slice(offset, offset + 500);
        try {
          unwrap(await client.from("patient_admissions").insert(batch));
        } catch (error) {
          if (offset > 0) {
            throw new Error(`Đã nhập ${offset}/${rows.length} dòng trước khi xảy ra lỗi: ${error.message}`);
          }
          throw error;
        }
      }
      return rows.length;
    },
    async getProviderCodeWatchlist() {
      await ensureMembership();
      const row = unwrap(await getClient()
        .from("provider_code_watchlists")
        .select("cchn_codes, gphn_codes, updated_at")
        .eq("id", true)
        .single());
      return {
        CCHN: row.cchn_codes,
        GPHN: row.gphn_codes,
        updatedAt: row.updated_at
      };
    },
    async saveProviderCodeWatchlist(codeLists) {
      const membership = await ensureAdmin();
      const normalizeCodes = codes => {
        if (!Array.isArray(codes) || !codes.every(code => typeof code === "string")) {
          throw new Error("Danh sách mã CCHN/GPHN không hợp lệ.");
        }
        return [...new Set(codes.map(code => code.trim()).filter(Boolean))];
      };
      unwrap(await getClient()
        .from("provider_code_watchlists")
        .upsert({
          id: true,
          cchn_codes: normalizeCodes(codeLists.CCHN),
          gphn_codes: normalizeCodes(codeLists.GPHN),
          updated_at: new Date().toISOString(),
          updated_by: membership.user_id
        }, { onConflict: "id" }));
    },
    subscribeToProviderCodeWatchlist(onChange, onError) {
      const channel = getClient()
        .channel("bedcare-provider-code-watchlist")
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table: "provider_code_watchlists"
        }, onChange)
        .subscribe(status => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            onError(new Error(`Không thể đồng bộ realtime danh sách mã (${status}).`));
          }
        });
      return () => getClient().removeChannel(channel);
    },
    async saveBed(bed, previousIdentity = null) {
      const client = getClient();
      if (previousIdentity) {
        const updated = unwrap(await client
          .from("beds")
          .update(toRow(bed))
          .eq("code", previousIdentity.code)
          .eq("room", previousIdentity.room || "")
          .select("code")
          .maybeSingle());
        if (!updated) throw new Error("Không tìm thấy giường cũ để cập nhật. Hãy tải lại dữ liệu.");
        return;
      }
      unwrap(await client.from("beds").upsert(toRow(bed), { onConflict: "code,room" }));
    },
    async importBeds(beds) {
      const client = getClient();
      const current = await client.from("beds").select("code", { count: "exact", head: true });
      if (current.error) throw current.error;
      if (current.count > 0) {
        throw new Error("Database đã có giường. Không nhập bản sao lưu để tránh ghi đè dữ liệu đang dùng.");
      }
      unwrap(await client.from("beds").upsert(beds.map(toRow), { onConflict: "code,room" }));
    },
    async deleteBed(code, room = "") {
      const deleted = unwrap(await getClient()
        .from("beds")
        .delete()
        .eq("code", code)
        .eq("room", room)
        .select("code")
        .maybeSingle());
      if (!deleted) throw new Error("Không tìm thấy giường cần xóa. Hãy tải lại dữ liệu.");
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
    },
    async subscribeToMembership(onChange, onError) {
      const client = getClient();
      const { user } = unwrap(await client.auth.getUser());
      if (!user) throw new Error("Cần đăng nhập để đồng bộ quyền tài khoản.");
      const channel = client
        .channel(`bedcare-membership-${user.id}`)
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table: "hospital_members",
          filter: `user_id=eq.${user.id}`
        }, onChange)
        .subscribe(status => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            onError(new Error(`Không thể đồng bộ quyền tài khoản (${status}).`));
          }
        });
      return () => client.removeChannel(channel);
    }
  };
})();
