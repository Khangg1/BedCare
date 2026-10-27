# BedCare: dùng chung dữ liệu trên nhiều thiết bị

## 1. Tạo database và bật realtime

1. Mở đúng Supabase project và kiểm tra hai UID bên dưới có trong **Authentication → Users**. Nếu UID chưa có tài khoản tương ứng, việc chạy SQL sẽ thất bại.
2. Vào **SQL Editor**, chạy toàn bộ `supabase-schema.sql`. Lệnh này tạo/cập nhật bảng giường, lịch sử lượt nằm viện, danh sách mã CCHN/GPHN dùng chung, phòng, phân quyền khoa bằng RLS và realtime. Admin được phép nhập lịch sử lượt nằm viện từ Excel; thành viên chỉ có thể xem lịch sử. Nếu đã cài BedCare trước đây, chạy lại toàn bộ tệp để áp dụng các thay đổi; dữ liệu khoa cũ `Liên Chuyên Khoa` được đổi thành `LCK`. Các tài khoản thành viên cũ được gán mặc định vào LCK, còn admin có quyền trên mọi khoa. UID `ae39ce7b-d6eb-4902-807c-91fb7a7aebc6` và UID admin1 `2a6ef87e-6c1e-42cf-8e37-20ce2f750f1c` sẽ là admin; UID `64f197b9-b119-463d-a0de-5ed6c3a561aa` sẽ là thành viên LCK. Các UUID cần tồn tại trước trong **Authentication → Users**.
3. `supabase-config.js` đã chứa Project URL và public publishable key. Không đưa `service_role`/secret key vào website hoặc Git.

## 2. Tạo tài khoản và cấp quyền

Người dùng có thể tự đăng ký username và mật khẩu trên màn hình đăng nhập. Username được ánh xạ thành địa chỉ nội bộ `username@bedcare.invalid` để dùng Supabase Auth; không cần email thật. Người đăng ký phải gửi UUID hiển thị sau đăng ký cho admin để được duyệt trong mục **Cài đặt → Quản lý thành viên**.

Để tạo tài khoản `admin1`: đăng xuất hoặc mở trang quản lý trên thiết bị mới, chọn **Chưa có tài khoản? Tạo tài khoản**, đăng ký username `admin1` cùng mật khẩu, rồi gửi UUID hiện ra cho admin đang hoạt động. Trong **Cài đặt → Quản lý thành viên**, nhập UUID, chọn vai trò **Admin — tất cả khoa**, rồi cấp quyền. Tài khoản chưa được admin cấp quyền sẽ không đọc được dữ liệu.

Trong Supabase, tắt **Authentication → Providers → Email → Confirm email** trước khi dùng đăng nhập username. Vì tài khoản không có email/số điện thoại thật, không thể khôi phục mật khẩu qua email; người dùng cần nhớ mật khẩu. Đăng ký tài khoản là công khai, nhưng tài khoản chưa được admin cấp quyền không thể xem hay sửa dữ liệu giường.

Admin cũng có thể tạo tài khoản email/mật khẩu trong **Authentication → Users**, rồi nhập UUID của tài khoản đó để cấp quyền. Để cấp quyền trực tiếp bằng SQL, thay UUID:

```sql
insert into public.hospital_members (user_id, role, department)
values ('UUID-TAI-KHOAN-SUPABASE', 'member', 'Nội')
on conflict (user_id) do update
set role = 'member',
    department = excluded.department;
```

Admin quản lý danh sách tài khoản, vai trò và khoa tại **Cài đặt → Quản lý thành viên**. Có thể chọn **Admin — tất cả khoa** hoặc **Thành viên — một khoa**. Các khoa hiện hỗ trợ là LCK, Nội, Ngoại, Đông Y và Cấp Cứu. Mỗi tài khoản thành viên chỉ xem/sửa giường và xem lịch sử thuộc khoa được gán; quyền này được áp dụng cả ở giao diện lẫn chính sách RLS trong Supabase. Admin có thể xem và quản lý tất cả khoa. Tài khoản không thể tự đổi quyền của chính mình.

Danh sách mã theo dõi CCHN/GPHN được lưu trong Supabase và dùng chung giữa các thiết bị đăng nhập BedCare. Chỉ tài khoản Admin được thêm hoặc sửa danh sách; các thành viên đã được cấp quyền có thể đọc danh sách để kiểm tra XML. Trên trang **Kiểm tra XML**, Admin nhập mỗi mã trên một dòng rồi chọn **Lưu danh sách mã**. Nếu trước đây đã nhập mã trên thiết bị hiện tại, Admin có thể nhập danh sách cũ lên Supabase bằng nút nhập hiện trên trang khi danh sách dùng chung còn trống.

## 3. Deploy website

Deploy cùng các tệp `index.html`, `tong-quan.html`, `quan-ly-giuong.html`, `kiem-tra-xml.html`, `bedcare-backend.js` và `supabase-config.js`. Cần Internet để tải thư viện Supabase và Excel từ CDN.

Đăng nhập bằng cùng một tài khoản được cấp quyền trên các thiết bị. Dữ liệu được lưu tập trung, và trang đang mở sẽ nhận thay đổi qua realtime. Nếu realtime mất kết nối, tải lại trang để đồng bộ lại.

Để thay dấu cộng bằng logo, bấm vào biểu tượng BedCare ở thanh bên và chọn ảnh PNG, JPG, WebP hoặc GIF tối đa 1 MB. Ảnh được lưu trong bộ nhớ trình duyệt hiện tại, dùng chung giữa hai trang BedCare trên cùng trình duyệt nhưng chưa đồng bộ sang thiết bị khác.

Trong mục **Bệnh nhân**, danh sách hiện tại được hiển thị cùng lịch sử từng lượt nằm viện. Lượt mới được ghi khi thêm bệnh nhân vào giường đang sử dụng; lượt được kết thúc khi bệnh nhân được bỏ khỏi giường, giường chuyển sang trạng thái khác hoặc giường bị xóa. Tài khoản thành viên chỉ được đọc lịch sử; lịch sử được hệ thống ghi tự động khi cập nhật giường.

Admin có thể nhập lịch sử cũ tại **Bệnh nhân → Nhập lịch sử từ Excel**. Sheet đầu tiên cần có cột `HỌ VÀ TÊN`, `NGÀY VÀO`, `NGÀY RA`, `TÊN GIƯỜNG`, `PHÒNG`; mỗi dòng là một lượt nằm viện, ngày có thể là ô ngày Excel hoặc định dạng `DD/MM/YYYY`, và để trống `NGÀY RA` nếu chưa có ngày xuất viện. Dòng có tên giường/phòng khớp duy nhất với giường hiện có sẽ tự lấy khoa của giường; với giường không khớp hoặc không duy nhất, Admin chọn khoa trong phần xem trước. Việc nhập chỉ thêm lịch sử, không đổi bệnh nhân hay trạng thái giường hiện tại. Chọn nút **Tải mẫu Excel** để lấy cấu trúc cột chuẩn. Nhập dữ liệu cần các bảng/quyền Supabase mới, vì vậy hãy chạy lại `supabase-schema.sql` trước khi sử dụng.

Trang **Tổng quan** có bảng KPI gồm công suất sử dụng, số lượt nhập viện và xuất viện trong tháng hiện tại, cùng thời gian nằm viện trung bình trên các lượt đã kết thúc. Thống kê lượt nằm viện chỉ bao gồm lịch sử được ghi nhận kể từ khi bật bảng `patient_admissions`.

Khi thêm hoặc sửa giường, có thể nhập tên/số phòng (không bắt buộc). Phòng được hiển thị trên thẻ giường, danh sách bệnh nhân, lịch sử và báo cáo; có thể tìm bằng ô tìm kiếm. Mã giường chỉ cần duy nhất trong cùng một phòng: ví dụ `LCK-01` có thể dùng ở cả Phòng 01 và Phòng 02. Chạy lại toàn bộ `supabase-schema.sql` để chuyển database hiện có sang khóa kết hợp phòng + mã giường; lệnh này cũng cập nhật cách lưu/xóa giường và ghép lịch sử nằm viện theo đúng phòng. Sau khi chạy xong, tải lại website để dùng quy tắc mới.

Khi nhập thời gian vào/ra viện, dùng bộ chọn ngày giờ của trình duyệt hoặc nút **Giờ hiện tại**; nút **×** xóa nhanh thời gian. Thời gian ra viện không được sớm hơn thời gian vào viện. Nếu để trống, hệ thống tiếp tục tự điền giờ hiện tại khi nhận bệnh hoặc xuất viện.

## 4. Chuyển dữ liệu đang lưu trên máy này

Nếu trình duyệt hiện tại có dữ liệu cũ trong `localStorage`, sau khi đăng nhập trên trang quản lý, hệ thống sẽ hiện nút nhập dữ liệu vào Supabase (chỉ khi database chưa có giường). Kiểm tra danh sách trước khi xác nhận nhập.

> Tên bệnh nhân là dữ liệu nhạy cảm. Chỉ cấp tài khoản cho người được phép và tuân thủ quy định bảo vệ dữ liệu của cơ sở.
