# Этап сборки: Сборка React-приложения
FROM node:18-alpine AS builder

WORKDIR /app

COPY package.json ./
COPY package-lock.json ./

RUN npm install

COPY . ./

RUN npm run build

# Этап запуска: Обслуживание статических файлов с помощью Nginx
FROM nginx:alpine

# Скопируйте собранные статические файлы из этапа сборки в директорию Nginx
COPY --from=builder /app/build /usr/share/nginx/html

# Опционально: скопируйте вашу пользовательскую конфигурацию Nginx
# Если у вас есть файл nginx.conf в корне проекта:
# COPY nginx.conf /etc/nginx/conf.d/default.conf

# Nginx по умолчанию слушает порт 80, Cloud Run ожидает, что приложение будет слушать порт,
# указанный в переменной окружения PORT. Для Nginx это обычно настраивается через конфиг.
# Если не используете кастомный конфиг, можно полагаться на дефолтный порт 80.
EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]