# BedCare: dùng chung dữ liệu trên nhiều thiết bị

## 1. Tạo database và bật realtime

1. Mở Supabase project đã tạo.
2. Vào **SQL Editor**, chạy toàn bộ `supabase-schema.sql`. Lệnh này tạo bảng giường, phân quyền RLS và thêm bảng vào publication realtime.
3. `supabase-config.js` đã chứa Project URL và public publishable key. Không đưa `service_role`/secret key vào website hoặc Git.

## 2. Tạo và cấp tài khoản

1. Trong **Authentication → Users**, tạo email/mật khẩu cho mỗi người được phép dùng BedCare.
2. Sao chép UUID của từng tài khoản.
3. Chạy trong SQL Editor, thay UUID:

```sql
insert into public.hospital_members (user_id)
values ('UUID-TAI-KHOAN-SUPABASE')
on conflict (user_id) do nothing;
```

Chỉ tài khoản nằm trong `hospital_members` mới đọc hoặc sửa được dữ liệu. Không bật đăng ký công khai.

## 3. Deploy website

Deploy cùng các tệp `index.html`, `tong-quan.html`, `quan-ly-giuong.html`, `bedcare-backend.js` và `supabase-config.js`. Cần Internet để tải thư viện Supabase từ CDN.

Đăng nhập bằng cùng một tài khoản được cấp quyền trên các thiết bị. Dữ liệu được lưu tập trung, và trang đang mở sẽ nhận thay đổi qua realtime. Nếu realtime mất kết nối, tải lại trang để đồng bộ lại.

## 4. Chuyển dữ liệu đang lưu trên máy này

Nếu trình duyệt hiện tại có dữ liệu cũ trong `localStorage`, sau khi đăng nhập trên trang quản lý, hệ thống sẽ hiện nút nhập dữ liệu vào Supabase (chỉ khi database chưa có giường). Kiểm tra danh sách trước khi xác nhận nhập.

> Tên bệnh nhân là dữ liệu nhạy cảm. Chỉ cấp tài khoản cho người được phép và tuân thủ quy định bảo vệ dữ liệu của cơ sở.
