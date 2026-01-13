
# Sử dụng một image Alpine cơ bản làm nền tảng
FROM alpine:latest

# Cập nhật danh sách gói và cài đặt các công cụ cần thiết
# - g++: Trình biên dịch C++
# - python3: Trình thông dịch Python 3
# - time: Tiện ích GNU time, cung cấp khả năng đo lường tài nguyên với định dạng tùy chỉnh
# --no-cache giúp giữ cho image nhỏ gọn
RUN apk update && apk add --no-cache g++ python3 time

# Thiết lập thư mục làm việc mặc định bên trong image
WORKDIR /app
