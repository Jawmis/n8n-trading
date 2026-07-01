
import mongoose, { Schema } from "mongoose"; 

const UserSchema = new Schema({
    username: {
        type: String,
        required: true
    },
    password: {
        type: String,
        required: true
    },

});

const NodesSchema = new Schema({
    type: {
        type: mongoose.Types.ObjectId,
        ref : 'Nodes'
    },
    data: {
        kind: String,
        enum: ["ACTION", "TRIGGER"],
        metadata : Schema.Types.Mixed
    }
}, {
    _id : false
})

const EdgesSchema = new Schema({
    id: {
        type: String,
        required : true
    },
    source: {
        type: String,
        required : true
    },
    target: {
        type: String,
        required : true
    }
}, {
    _id : false
})

const WorkflowSchema = new Schema({
    userId: {
        type: mongoose.Types.ObjectId,
        required: true,
        ref: 'Users'
    },
    nodes: [],
    edges : [EdgesSchema]
});

export const UserModel = mongoose.model("Users", UserSchema);



