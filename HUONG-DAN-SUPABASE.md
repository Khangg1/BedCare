# BedCare: dùng chung dữ liệu trên nhiều thiết bị

## 1. Tạo database và bật realtime

1. Mở đúng Supabase project và kiểm tra hai UID bên dưới có trong **Authentication → Users**. Nếu UID chưa có tài khoản tương ứng, việc chạy SQL sẽ thất bại.
2. Vào **SQL Editor**, chạy toàn bộ `supabase-schema.sql`. Lệnh này tạo bảng giường, phân quyền RLS và bật realtime. UID `ae39ce7b-d6eb-4902-807c-91fb7a7aebc6` sẽ là admin; UID `64f197b9-b119-463d-a0de-5ed6c3a561aa` sẽ là thành viên.
3. `supabase-config.js` đã chứa Project URL và public publishable key. Không đưa `service_role`/secret key vào website hoặc Git.

## 2. Tạo tài khoản và cấp quyền

Người dùng có thể tự đăng ký username và mật khẩu trên màn hình đăng nhập. Username được ánh xạ thành địa chỉ nội bộ `username@bedcare.invalid` để dùng Supabase Auth; không cần email thật. Người đăng ký phải gửi UUID hiển thị sau đăng ký cho admin để được duyệt trong mục **Cài đặt → Quản lý thành viên**.

Trong Supabase, tắt **Authentication → Providers → Email → Confirm email** trước khi dùng đăng nhập username. Vì tài khoản không có email/số điện thoại thật, không thể khôi phục mật khẩu qua email; người dùng cần nhớ mật khẩu. Đăng ký tài khoản là công khai, nhưng tài khoản chưa được admin cấp quyền không thể xem hay sửa dữ liệu giường.

Admin cũng có thể tạo tài khoản email/mật khẩu trong **Authentication → Users**, rồi nhập UUID của tài khoản đó để cấp quyền. Để cấp quyền trực tiếp bằng SQL, thay UUID:

```sql
insert into public.hospital_members (user_id)
values ('UUID-TAI-KHOAN-SUPABASE')
on conflict (user_id) do nothing;
```

Admin quản lý danh sách thành viên; thành viên được phép quản lý dữ liệu giường nhưng không thể cấp quyền cho người khác. Chỉ tài khoản nằm trong `hospital_members` mới đọc hoặc sửa được dữ liệu.

## 3. Deploy website

Deploy cùng các tệp `index.html`, `tong-quan.html`, `quan-ly-giuong.html`, `bedcare-backend.js` và `supabase-config.js`. Cần Internet để tải thư viện Supabase từ CDN.

Đăng nhập bằng cùng một tài khoản được cấp quyền trên các thiết bị. Dữ liệu được lưu tập trung, và trang đang mở sẽ nhận thay đổi qua realtime. Nếu realtime mất kết nối, tải lại trang để đồng bộ lại.

## 4. Chuyển dữ liệu đang lưu trên máy này

Nếu trình duyệt hiện tại có dữ liệu cũ trong `localStorage`, sau khi đăng nhập trên trang quản lý, hệ thống sẽ hiện nút nhập dữ liệu vào Supabase (chỉ khi database chưa có giường). Kiểm tra danh sách trước khi xác nhận nhập.

> Tên bệnh nhân là dữ liệu nhạy cảm. Chỉ cấp tài khoản cho người được phép và tuân thủ quy định bảo vệ dữ liệu của cơ sở.
