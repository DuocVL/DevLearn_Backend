const mongoose = require('mongoose');
const Posts = require('../models/Posts');
const User = require('../models/User'); // Cần để kiểm tra role admin

// Hàm tiện ích để ẩn thông tin tác giả
const sanitizePost = (post, currentUser) => {
    // Chuyển document mongoose thành object thuần túy để có thể sửa đổi
    const postObject = post.toObject ? post.toObject() : { ...post };

    // Nếu bài viết là ẩn danh VÀ người xem không phải là tác giả của nó
    if (postObject.anonymous && (!currentUser || postObject.authorId.toString() !== currentUser.id.toString())) {
        delete postObject.authorId; // Xóa thông tin tác giả
    }
    return postObject;
};


// CREATE A NEW POST
const handlerAddPost = async (req, res) => {
    try {
        const { title, content, tags, anonymous, status } = req.body;

        if (!title || !content) {
            return res.status(400).json({ message: "Title and content are required." });
        }

        const post = await Posts.create({
            title,
            content,
            authorId: req.user.id,
            tags: tags || [],
            anonymous: anonymous || false,
            status: (status === 'draft') ? 'draft' : 'published', // Chỉ cho phép 2 giá trị
        });

        return res.status(201).json({ message: "Post created successfully", data: post });
    } catch (err) {
        console.error("Error creating post:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

// UPDATE AN EXISTING POST
const handlerUpdatePost = async (req, res) => {
    try {
        const { postId } = req.params;
        const { title, content, tags, anonymous, status } = req.body;

        if (!mongoose.Types.ObjectId.isValid(postId)) {
            return res.status(400).json({ message: "Invalid Post ID" });
        }

        const post = await Posts.findById(postId);

        if (!post || post.isDeleted) {
            return res.status(404).json({ message: "Post not found" });
        }

        // Authorization: User phải là tác giả HOẶC là admin
        if (post.authorId.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ message: "You are not authorized to update this post" });
        }

        // Cập nhật các trường nếu chúng được cung cấp
        if (title) post.title = title;
        if (content) post.content = content;
        if (tags) post.tags = tags;
        if (typeof anonymous === 'boolean') post.anonymous = anonymous;
        if (status && ['published', 'draft'].includes(status)) post.status = status;

        const updatedPost = await post.save();

        return res.status(200).json({ message: "Post updated successfully", data: updatedPost });
    } catch (err) {
        console.error("Error updating post:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

// SOFT DELETE A POST
const handlerDeletePost = async (req, res) => {
    try {
        const { postId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(postId)) {
            return res.status(400).json({ message: "Invalid Post ID" });
        }
        
        const post = await Posts.findById(postId);

        if (!post || post.isDeleted) {
            return res.status(404).json({ message: "Post not found" });
        }

        // Authorization: User phải là tác giả HOẶC là admin
        if (post.authorId.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ message: "You are not authorized to delete this post" });
        }

        // Thực hiện xóa mềm
        post.isDeleted = true;
        await post.save();
        
        return res.status(200).json({ message: "Post deleted successfully" });
    } catch (err) {
        console.error("Error deleting post:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

// GET A SINGLE POST
const handlerGetPost = async (req, res) => {
    try {
        const { postId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(postId)) {
            return res.status(400).json({ message: "Invalid Post ID" });
        }

        const post = await Posts.findOne({ _id: postId, isDeleted: false })
                             .populate('authorId', 'username avatar');

        if (!post) {
            return res.status(404).json({ message: "Post not found" });
        }
        
        // Chỉ người dùng đã đăng nhập mới có thể xem bản nháp của chính họ
        if (post.status === 'draft' && (!req.user || post.authorId._id.toString() !== req.user.id)) {
             return res.status(404).json({ message: "Post not found" });
        }

        const sanitized = sanitizePost(post, req.user);

        return res.status(200).json({ data: sanitized });
    } catch (err) {
        console.error("Error getting post:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

// GET A LIST OF POSTS (PAGINATED)
const handleGetListPost = async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 20;
        const { tag } = req.query;
        const skip = (page - 1) * limit;

        const filter = { isDeleted: false, status: 'published' }; // Mặc định chỉ lấy bài đã published
        if (tag) {
            filter.tags = tag;
        }

        const total = await Posts.countDocuments(filter);
        const posts = await Posts.find(filter)
            .populate('authorId', 'username avatar')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        // Ẩn thông tin tác giả cho các bài viết ẩn danh
        const sanitizedPosts = posts.map(post => sanitizePost(post, req.user));

        return res.status(200).json({ 
            data: sanitizedPosts, 
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
