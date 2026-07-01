import express from 'express';
import mongoose from 'mongoose';
import { UserModel } from 'db/client';

mongoose.connect(process.env.MONGO_URL!);

const app = express();

app.post("/signup", (req, res) => {
    UserModel.create({

    })
});

app.post("/signin", (req, res) => {
    
});

app.post("/workflow", (req, res) => {

});

app.put("/workflow", (req, res) => {
    
});

app.get("/workflow/:workflowId", (req, res) => {
    
});

app.get("/workflow/executions/:workflowId", (req, res) => {
    
});

app.post("/credentials", (req, res) => {
    
})
app.get("/credentials", (req, res) => {
    
})
app.listen(process.env.PORT || 3000);

