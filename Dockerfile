# syntax=docker/dockerfile:1

# =========================================================
# 1. Vite 애플리케이션 빌드
# =========================================================
FROM node:22-alpine AS builder

WORKDIR /app

# 의존성 파일을 먼저 복사하여 Docker 빌드 캐시 활용
COPY package.json package-lock.json ./

# package-lock.json을 기준으로 정확한 버전 설치
RUN npm ci

# 프로젝트 소스 복사
COPY . .

# Vite 프로덕션 빌드
RUN npm run build


# =========================================================
# 2. 빌드 결과물을 Nginx로 제공
# =========================================================
FROM nginx:1.27-alpine AS runtime

# 기본 Nginx 정적 파일 제거
RUN rm -rf /usr/share/nginx/html/*

# Vite 빌드 결과물 복사
COPY --from=builder /app/dist /usr/share/nginx/html

# SPA 라우팅 설정 복사
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]