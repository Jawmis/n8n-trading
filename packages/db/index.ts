
import mongoose, { Schema } from "mongoose"; 

const UserSchema = new Schema({
    username: {
        type: String,
        required: true,
        unique : true
    },
    password: {
        type: String,
        required: true,
        select: false
    },
    tokenVersion: {
        type: Number,
        required: true,
        default: 0
    },

});

const CredentialSchema = new Schema({
    userId: { type: mongoose.Types.ObjectId, required: true, ref: "Users" },
    provider: { type: String, required: true, enum: ["lighter", "hyperliquid", "backpack"] },
    ciphertext: { type: String, required: true },
    iv: { type: String, required: true },
    authTag: { type: String, required: true },
}, { timestamps: true });
CredentialSchema.index({ userId: 1, provider: 1 });

const PositionSchema = new Schema({
    x: {
        type: Number,
        required : true
    },
    y: {
        type: Number,
        required : true
    }
}, {
    _id : false
});

const NodeDataSchema = new Schema({
    kind: {
        type : String,
        enum: ["ACTION", "TRIGGER"]},
        metadata : Schema.Types.Mixed
}, {
    _id : false
})

const MetadataSchema = new Schema({
    kind: {
        type: String, enum: ["string", "number", "boolean", "select"]
    },
    title: {
        type: String,
        required : true
    },
    description: {
        type: String,
        required: true
    },
    values : [Schema.Types.Mixed]
}, {
    _id : false
})

const WorkflowNodeSchema = new Schema({
    id: {
        type: String,
        required : true
    },
    position: PositionSchema,
    credentials: {
        type : Schema.Types.Mixed,
        select: false
    },
    nodeId: {
        type: String,
        required: true
    },
    type: {
        type: String,
        required: true,
        enum: ["timer", "price-trigger", "lighter", "backpack", "hyperliquid"]
    },
    credentialId: {
        type: mongoose.Types.ObjectId,
        ref: "Credentials"
    },
    data: NodeDataSchema
    
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
    nodes: [WorkflowNodeSchema],
    edges : [EdgesSchema],
    runRequestedAt: {
        type: Date
    }
});
WorkflowSchema.index({ userId: 1 });

const CredentialsTypeSchema = new Schema({
    title: {
        type: String,
        required : true
    },
    required: {
        type: Boolean,
        required : true
    }
})

const NodesSchema = new Schema({
    title: {
        type: String,
        required : true
    },
    description: {
        type: String,
        required : true
    },
    type: {
        type: String,
        required: true,
        enum : ["ACTION" , "TRIGGER"]
    },
    credentialsType :[CredentialsTypeSchema]
})

const ExecutionSchema = new Schema({
    workflowId: {
        type: mongoose.Types.ObjectId,
        required: true,
        ref : 'Workflows'
    },
    status: {
        type: String,
        enum : ["pending", "running", "success", "failure"]
    },
    kind: {
        type: String,
        enum: ["manual", "timer"],
        required: true
    },
    startTime: {
        type: Date,
        default: Date.now,
        required : true
    },
    endTime: {
        type: Date
    },
    claimedAt: {
        type: Date
    },
    leaseUntil: {
        type: Date
    },
    attempt: {
        type: Number,
        default: 0,
        required: true
    },
    queueKey: {
        type: String,
        unique: true,
        sparse: true
    },
    error: {
        type: String
    }
})
ExecutionSchema.index({ workflowId: 1, startTime: -1 });
ExecutionSchema.index({ status: 1, leaseUntil: 1 });

export const UserModel = mongoose.model("Users", UserSchema);
export const CredentialModel = mongoose.model("Credentials", CredentialSchema);
export const WorkflowModel = mongoose.model("Workflows", WorkflowSchema);
export const NodesModel = mongoose.model("Nodes", NodesSchema);
export const ExecutionModel = mongoose.model("Executions", ExecutionSchema);
