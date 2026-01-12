FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

EXPOSE 8080
ENV PORT=8080

CMD ["npm", "run", "start:prod"]
