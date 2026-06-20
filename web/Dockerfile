FROM node:20-alpine

WORKDIR /app
COPY web/package.json /app/package.json
RUN npm install

COPY web /app

ENV HOST=0.0.0.0
EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
