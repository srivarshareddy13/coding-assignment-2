const express = require('express')
const path = require('path')

const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const app = express()
const dbPath = path.join(__dirname, 'twitterClone.db') 
app.use(express.json())
const bcrypt = require("bcrypt") 
const jwt = require("jsonwebtoken")
let db = null 

const initializeDbAndServer = async () => {
    try {
        db = await open({
            filename: dbPath,
            driver: sqlite3.Database,
        }) 
        app.listen(3000, () => {
            console.log("Success")
        })
    } catch (e) {
        console.log(`DB Error: ${emessage}`)
        process.exit(1)
    }
};
initializeDbAndServer(); 

const getFollowingId = async (username) => {
    const getUserId = ` 
    SELECT following_user_id 
    FROM follower INNER JOIN 
        user ON user.user_id = follower.follower_user_id
    WHERE username = '${username}';
    `;
    const result = await db.all(getUserId) 
    const arrayOfId = result.map((each) => each.following_user_id);
    return arrayOfId;
};

const authentication = (request, response, next) => {
    let jwtToken;
    const authHeader = request.headers["authorization"] 
    if (authHeader) {
        jwtToken = authHeader.split(" ")[1]; 

        if (jwtToken === undefined) {
            response.status(401);
             response.send("Invalid JWT Token")
        } else {
            jwt.verify(jwtToken, "SECRET_KEY", async (error, payload) => {
                if (error) {
                    response.status(401);
                    response.send("Invalid JWT Token")
                } else 
                request.username= payload.username
                request.userId = payload.userId 
                next();
            });
        }

    } 
};

const tweetAcess = async (request, response, next) => {
    const {userId} = request;
    const {tweetId} = request.params;
    const getQuery = `
        SELECT *
        FROM tweet INNER JOIN 
            follower ON  tweet.user_id = follower.following_user_id
        WHERE 
            tweet.tweet_id = '${tweetId}' AND follower_user_id= '${userId}';
    `;
    const tweet = await db.get(getQuery) 

    if (tweet === undefined){
        response.status(401)
        response.send("Invalid Request");
    } else {
        next();
    }
    
};
//api 1 x;
app.post("/register/", async (request, response) => {
    const {username, password, name, gender} = request.body 
    const selectedUser = `SELECT * FROM user WHERE username='${username}'`;
    const dbUser = await db.get(selectedUser) 
    
    if (dbUser !== undefined) {
        response.status(400)
        response.send("User already exists")
    } else {
        if (password.length < 6) {
            response.status(400)
            response.send("Password is too short")
        } else {
            const hashedPassword = await bcrypt.hash(password, 10)
            const userQuery = `
                INSERT INTO 
                    user (username, password, name, gender)
                VALUES (
                    '${username}',
                    '${hashedPassword}',
                    '${name}',
                    '${gender}',
                )
            ` 
            const result = await db.run(userQuery)
            response.status(200)
            response.send("User created successfully")
        }
    }
}); 
// api 2 
app.post("/login/", async (request,response) => {
    const {username, password} = request.body 
    const selectedUser = `SELECT * FROM user WHERE username = '${username}'`; 
    const dbUser = await db.get(selectedUser) 

    if (dbUser !== undefined) {
            const isPassword = await bcrypt.compare(password, dbUser.password);
        if (isPassword) {
            const payload = {username, userId: dbUser.userId};
            const jwtToken = jwt.sign(payload, "SECRET_KEY")
            response.send({jwtToken})
        } else {
            response.status(400)
            response.send("Invalid password")
        }
    } else {
        response.status(400)
        response.send("Invalid user");
    }
});
//api 3 
app.get("/user/tweets/feed/", authentication, async (request, response) => {
    const {username} = request
    const followingId = await getFollowingId(username) 

    const getQuery= ` 
        SELECT username, tweet , date_time as dateTime 
        FROM 
            user INNER JOIN 
            tweet ON user.user_id = tweet.user_id 
        WHERE 
            user.user_id IN (${followingId}) 
        ORDER BY date_time DESC 
        LIMT 4;`; 

        const result = await db.all(getQuery) 
        response.send(result)
});

//api 4 
app.get("/user/following/", authentication, async (request, response) => {
    const {username, userId} = request 
    const getQuery = `
    SELECT name 
    FROM user INNER JOIN follower 
        ON user.user_id = follower.following_user_id 
    WHERE follower_user_id = ${userId};
    `;
    const result = await db.all(getQuery)
    response.send(result)
});
//api 5 
app.get("/user/followers/", authentication, async (request,response) => {
    const {username, userId} = request 
    const getQuery = `
    SELECT DISTINCT name 
    FROM follower INNER JOIN user
        ON user.user_id = follower.follower_user_id 
    WHERE following_user_id = ${userId};
    `;
    const result = await db.all(getQuery)
    response.send(result)
});

app.get("/tweets/:tweetId/",authentication, tweetAcess, async (request,response) => {
    const {username, userId} = request;
    const {tweetId} = request.params 

    const getQuery = `
        SELECT tweet,
                (SELECT COUNT() FROM like WHERE tweet_id = '${tweetId}') AS likes,
                (SELECT COUNT() FROM reply WHERE tweet_id = '${tweetId}') AS replies,
                date_time AS dateTime 
        FROM tweet 
        WHERE tweet.tweet_id = '${tweetId}';
    `;
    const tweet = await db.get(getQuery);
    response.send(tweet)
}); 
//api 7 
app.get("/tweets/:tweetId/likes/", authentication, tweetAcess, async (request,response) => {
    const {tweetId} = request.params 
    const getQuery = `
        SELECT username 
        FROM  user INNER JOIN 
        like ON user.user_id = like.user_id 
        WHERE tweet_id = '${tweetId}';
    `; 
    const result = await db.all(getQuery) 
    const useerArray = result.map((each) => each.username) 
    response.send({likes: useerArray});
});
//api 8 
app.get("/tweets/:tweetId/replies/", authentication, tweetAcess, async (request,response) => {
    const {tweetId} = request.params;
    const getQuery = `
        SELECT name,reply 
        FROM user INNER JOIN 
        reply ON user.user_id = reply.user_id 
        WHERE tweet_id = '${tweetId}';
    `;
    const result = await db.all(getQuery)
    response.send({replies: result});
});
//api 9 
app.get("/user/tweets/", authentication, async (request,response) => {
    const {userId} = request;
    const getQuery = `
    SELECT tweet,
            COUNT(DISTINCT like_id) AS likes,
            COUNT(DISTINCT reply_id) AS replies,
            date_time AS dateTime
    FROM tweet LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id LEFT JOIN like ON tweet.tweet_id = like.tweet_id
    WHERE tweet.user_id = ${userId}
    GROUP BY tweet.twet_id;`;
    const result = await db.all(getQuery) 
    response.send(result);
});
//api 10 
app.post("/user/tweets/", authentication, async (request,response) => {
    const {tweet} = request.body 
    const userId = parseInt(request.userId);
    const dateTime = new Date().toJSON().substring(0, 19).replace("T", " ");
    const createQuery = `
                INSERT INTO 
                tweet (tweet, user_id, date_time)
                VALUES (
                        '${tweet}',
                        '${userId}',
                        '${dateTime}'
                    )`;
                await db.run(createQuery) 
                response.send("Created a Tweet")
});
//api 11
app.delete("/tweets/:tweetId", authentication, async (request,response) => {
    const {tweetId} = request.params;
    const {userId} = request;
    const getQuery = `
        SELECT *
        FROM tweet 
        WHERE user_id = '${userId}' AND tweet_id = '${tweetId}';`;
        const tweet = await db.get(getQuery)
        console.log(tweet)
        if (tweet === undefined) {
            response.status(401)
            response.send("Invalid Request")
        } else {
            const deleteQuery = `DELETE FROM tweet WHERE tweet_id = '${tweetId}';`;
            await db.run(deleteQuery)
            response.send("Tweet Removed");
        }
});
module.exports = app;