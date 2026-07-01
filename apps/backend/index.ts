import express from 'express';

const app = express();

app.post("/signup", (req, res) => {
    
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

