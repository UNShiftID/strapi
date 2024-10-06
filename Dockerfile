# Use the official Node.js image.
FROM node:20

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install --production

COPY . .

RUN npm run build

EXPOSE 1337

CMD ["npm", "start"]
