import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError }  from "../utils/ApiError.js"
import { User } from "../models/user.models.js"
// import { upload } from '../middlewares/multer.middleware.js'
import { cloudinaryUpload } from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js"

const registerUser = asyncHandler( async (req, res) => {
    const {fullname, username, email, password } = req.body

    if(
        [fullname, username, email, password].some((field) => field?.trim() === "")
    ){
        throw new ApiError(400, "Fill the required fields");
    }

    const existUser = await User.findOne({
        $or: [{username}, {email}]
    })

    if(existUser){
        throw new ApiError(400, "User already exists")
    }

    // const avatarLocalPath = req.files?.avatar[0]?.path;
    // const coverImageLocalPath = req.files?.coverImage[0]?.path;

    let coverImageLocalPath;

    if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0){
        coverImageLocalPath = req.files.coverImage[0].path;
    }

    let avatarLocalPath;

    if(req.files && Array.isArray(req.files.avatar) && req.files.avatar.length > 0){
        avatarLocalPath = req.files.avatar[0].path;
    }

    if(!avatarLocalPath){
        throw new ApiError(400, "Upload an avatar")
    }

    const avatar = await cloudinaryUpload(avatarLocalPath)

    let coverImage = {
        url: ""
    };

    if(coverImageLocalPath){
        coverImage = await cloudinaryUpload(coverImageLocalPath)
    }

    if(!avatar){
        throw new ApiError(500, "Something went wrong while uploading avatar")
    }

    const user = await User.create({
        username: username.toLowerCase(),
        email,
        password,
        fullname,
        avatar: avatar.url,
        coverImage: coverImage.url || ""
    })

    const createdUser = await User.findById(user._id).select(
        "-password -refreshTokens"
    )

    if(!createdUser){
        throw new ApiError(500, "Something went wrong while creating user")
    }

    return res.status(200).json(
        new ApiResponse(201 , createdUser , "User successfully created")
    )



})

export {registerUser}