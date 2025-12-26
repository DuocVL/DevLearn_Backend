const Posts = require('../models/Posts');

const handlerAddPost = async (req, res) => {
    try {
        const { title, content, tags, anonymous } = req.body;
        if( !title || !content || !anonymous) return res.status(400).json({ message: "Title & Content required "});
        const post = await Posts.create({
            title: title,
            content: content,
            authorId: req.userId,
            tags: tags,
            anonymous: anonymous,
        });

        return res.status(201).json({ message: "Post created", post });
    } catch (err) {
        res.status(500).json({ message: "Error creating post" });
    }
};

const handlerUpdatePost = async (req, res) => {
    try {
        const { postId, title, content, tags } = req.body;
        if( !postId || !title || !content) return res.status(400).json({ message: "PostId, Title & Content required "});
        const postUpdated = await Posts.findByIdAndUpdate(
            postId,
            {
                title: title,
                content: content,
                tags: tags,
            },
            { new: true }
        );

        return res.status(201).json({ message: "Post updated", postUpdated });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error updateing post" });
    }
};

const handlerDeletePost = async (req, res) => {
    try {
        const { postId } = req.body;
        if( !postId) return res.status(400).json({ message: "PostId required "});
        const post = await Posts.findOne({ _id: postId, authorId: req.userId });
        if(!post) return res.status(403).json({ message: "User does not have permission to delete resource" });
        await Posts.findByIdAndDelete( postId.$oid );
        return res.status(201).json({ message: "Post deleted" });
    } catch (err) {
        res.status(500).json({ message: "Error deleteing post" });
    }
};

const handlerGetPost = async (req, res) => {
    try {
        const postId = req.params.postId;
        if(!postId) return res.status(400).json({ message: "PostId required"});
        const post = await Posts.findById(postId);
        if(!post) return res.status(404).json({ message: "Post resource does not exist"});
        return res.status(200).json({ post });
    } catch (err) {
        res.status(500).json({ message: "Error geting post"});
    }
};

const handleGetListPost = async (req, res) => {
    try {
        const { page = 1, limit = 20, tag } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const filter = { hidden: false };
        if (tag) filter.tags = tag;

        const total = await Posts.countDocuments(filter);
        const posts = await Posts.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit));

        return res.status(200).json({ data: posts, pagination: { currentPage: parseInt(page), totalPages: Math.ceil(total / limit), total } });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

module.exports = { handlerAddPost , handlerUpdatePost, handlerDeletePost, handlerGetPost, handleGetListPost };