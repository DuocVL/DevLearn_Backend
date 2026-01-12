const mongoose = require('mongoose');
const Posts = require('../models/Posts');

// CREATE A NEW POST
const handlerAddPost = async (req, res) => {
    try {
        const { title, content, tags, anonymous } = req.body;

        // Corrected Validation: Check for presence of title/content and if anonymous is a boolean
        if (!title || !content || typeof anonymous !== 'boolean') {
            return res.status(400).json({ message: "title, content, and the anonymous flag (boolean) are required." });
        }

        const post = await Posts.create({
            title: title,
            content: content,
            // Corrected: Get user ID from the verified JWT middleware object
            authorId: req.user._id, 
            tags: tags || [], // Default to empty array if tags are not provided
            anonymous: anonymous,
        });

        return res.status(201).json({ message: "Post created successfully", post });
    } catch (err) {
        console.error("Error creating post:", err);
        res.status(500).json({ message: "Internal server error while creating post" });
    }
};

// UPDATE AN EXISTING POST
const handlerUpdatePost = async (req, res) => {
    try {
        const { postId } = req.params; // RESTful: Get ID from URL parameters
        const { title, content, tags, anonymous } = req.body;

        if (!mongoose.Types.ObjectId.isValid(postId)) {
            return res.status(400).json({ message: "Invalid Post ID format" });
        }

        if (!title || !content || typeof anonymous !== 'boolean') {
            return res.status(400).json({ message: "title, content, and anonymous flag are required" });
        }

        const post = await Posts.findById(postId);

        if (!post) {
            return res.status(404).json({ message: "Post not found" });
        }

        // Authorization: Check if the user is the author of the post
        if (post.authorId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: "You are not authorized to update this post" });
        }

        // Update fields
        post.title = title;
        post.content = content;
        post.tags = tags || [];
        post.anonymous = anonymous;

        const updatedPost = await post.save();

        return res.status(200).json({ message: "Post updated successfully", post: updatedPost });
    } catch (err) {
        console.error("Error updating post:", err);
        res.status(500).json({ message: "Internal server error while updating post" });
    }
};

// DELETE A POST
const handlerDeletePost = async (req, res) => {
    try {
        const { postId } = req.params; // RESTful: Get ID from URL parameters

        if (!mongoose.Types.ObjectId.isValid(postId)) {
            return res.status(400).json({ message: "Invalid Post ID format" });
        }
        
        // Corrected: Use req.user._id from JWT middleware
        const post = await Posts.findOne({ _id: postId, authorId: req.user._id });

        if (!post) {
            return res.status(403).json({ message: "Post not found or you do not have permission to delete it" });
        }

        // Corrected: Correctly call the delete function with the ID string
        await Posts.findByIdAndDelete(postId);
        
        return res.status(200).json({ message: "Post deleted successfully" });
    } catch (err) {
        console.error("Error deleting post:", err);
        res.status(500).json({ message: "Internal server error while deleting post" });
    }
};

// GET A SINGLE POST
const handlerGetPost = async (req, res) => {
    try {
        const { postId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(postId)) {
            return res.status(400).json({ message: "Invalid Post ID format" });
        }

        const post = await Posts.findById(postId);

        // Do not show hidden posts unless requested by a specific role (future enhancement)
        if (!post || post.hidden) {
            return res.status(404).json({ message: "Post not found" });
        }
        
        return res.status(200).json({ post });
    } catch (err) {
        console.error("Error getting post:", err);
        res.status(500).json({ message: "Internal server error while getting post" });
    }
};

// GET A LIST OF POSTS (PAGINATED)
const handleGetListPost = async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 20;
        const { tag } = req.query;
        const skip = (page - 1) * limit;

        // Corrected: Filter for posts that are not explicitly hidden
        const filter = { hidden: { $ne: true } };
        if (tag) {
            filter.tags = tag; // Find posts that include the specific tag
        }

        const total = await Posts.countDocuments(filter);
        const posts = await Posts.find(filter)
            .populate('authorId', 'username avatar') // Populate author info
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        return res.status(200).json({ 
            data: posts, 
            pagination: { 
                currentPage: page, 
                totalPages: Math.ceil(total / limit), 
                totalItems: total 
            } 
        });
    } catch (err) {
        console.error("Error getting post list:", err);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

module.exports = { handlerAddPost , handlerUpdatePost, handlerDeletePost, handlerGetPost, handleGetListPost };
