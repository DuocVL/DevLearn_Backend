const mongoose = require('mongoose');
const Reactions = require('../models/Reactions');
const Posts = require('../models/Posts');
const Problems = require('../models/Problems');
const Lessons = require('../models/Lessons');
const Comments = require('../models/Comments');


const map = {
        posts: Posts,
        problems: Problems,
        lessons: Lessons,
        comments: Comments,
    };

async function updateCollection(targetId, targetType, reaction, number){

    const model = map[targetType];
    if (!model) throw new Error("Invalid targetType");
    const field = reaction === "like" ? "likeCount" : "unlikeCount";
    await model.updateOne({ _id: targetId }, { $inc: { [field]: number } });
}

//Thêm Reaction
const handlerAddReaction = async (req, res) => {
    try {
        const { targetType, targetId, reaction } = req.body;
        if( !targetType || !targetId || !reaction) return res.status(400).json({ message: "Missing required fields" });
        if (!mongoose.Types.ObjectId.isValid(targetId))  return res.status(400).json({ message: "Invalid targetId" });

        const userId = req.user._id;
        const reactionOld = await Reactions.findOne({ targetType: targetType, targetId: targetId, userId });
        if(reactionOld) return res.status(409).json({ message: "Reaction already exists" });
        const newReaction = await Reactions.create({
            userId,
            targetId: targetId,
            targetType: targetType,
            reaction: reaction,
        });
        await updateCollection(targetId, targetType, reaction, 1);

        return res.status(201).json({ message: "Reaction created successfully",data: newReaction,});
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }

};

//Delete Reaction
const handlerDeleteReaction = async (req, res) => {
    try {
        const reactionId = req.params.reactionId;
        if(!reactionId) res.status(400).json({ message: "Missing required fields" });
        if (!mongoose.Types.ObjectId.isValid(reactionId)) return res.status(400).json({ message: "Invalid reactionId" });

        const reactionObject = await Reactions.findById(reactionId);
        if(!reactionObject) return res.status(404).json({ message: "Reaction not found" });

        if(!reactionObject.userId.equals(req.user._id)) return res.status(403).json({ message: "Forbidden: Not your reaction" });

        await updateCollection(reactionObject.targetId, reactionObject.targetType, reactionObject.reaction, -1);
        await reactionObject.deleteOne();

        return res.status(200).json({ message: "Reaction deleted successfully" });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

//Đổi Reaction
const handlerSwapReaction = async (req, res) => {
    try {
        const reactionId = req.params.reactionId;
        if (!mongoose.Types.ObjectId.isValid(reactionId)) return res.status(400).json({ message: "Invalid reactionId" });

        const { reaction } = req.body
        if(!reaction) return res.status(400).json({ message: "Missing 'reaction' field" });

        const reactionObject = await Reactions.findById(reactionId);
        if(!reactionObject) return res.status(404).json({ message: "Reaction not found" });

        if(!reactionObject.userId.equals(req.user._id)) return res.status(403).json({ message: "Forbidden: Not your reaction" });

        await updateCollection(reactionObject.targetId, reactionObject.targetType, reactionObject.reaction, -1);
        await updateCollection(reactionObject.targetId, reactionObject.targetType, reaction, 1);

        const reactionUpdate = await Reactions.findByIdAndUpdate(
            reactionId,
            {
                reaction: reaction,
            },
            { new: true }
        );

        return res.status(200).json({message: "Reaction updated successfully", data: reactionUpdate,});
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

//TODO:Lấy danh sách user đã reaction
const handlerGetUserReaction = async (req, res) => {

};

module.exports = { handlerAddReaction, handlerSwapReaction, handlerDeleteReaction, handlerGetUserReaction};