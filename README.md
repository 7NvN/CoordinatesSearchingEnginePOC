Match Routing search engine:
It is a POC for the matching the route from the list of cordinates strings- Line String. if a match is successful it returns the details.

Files details:

route_db.json: It is a file of dummy records in the json format. Our engine will run against this records to see if your patch is present in it or not.

search_engine.js: It is our main file that will take the pickup and drop coordinates, use the turf library to get the matching route. right now we can change the pickup and drop coordinates and add a record in the routes_db.json to test the file.
<img width="648" height="285" alt="image" src="https://github.com/user-attachments/assets/79aa4320-5106-4583-8020-c883a0e81518" />

## Prerequisites

Ensure you have [Node.js](https://nodejs.org/) installed (v18.0.0 or higher recommended):

## Install node
node -v
npm -v

## Clone project
git clone https://github.com/ChhayankS-tech/CoordinatesSearchingEnginePOC.git

## Point the terminal to right folder
cd CoordinatesSearchingEnginePOC

## run the command to install dependencies
npm install

## run search engine
node search_engine.js
