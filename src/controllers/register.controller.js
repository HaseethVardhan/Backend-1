import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.models.js";
// import { upload } from '../middlewares/multer.middleware.js'
import { cloudinaryUpload } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

const generateAccessandRefreshtoken = async (userId) => {
  try {
    const user = await User.findById(userId);

    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };

  } catch (error) {
    throw new ApiError(500, "Error while generating tokens");
  }
};

const registerUser = asyncHandler(async (req, res) => {
  const { fullname, username, email, password } = req.body;

  if (
    [fullname, username, email, password].some((field) => field?.trim() === "")
  ) {
    throw new ApiError(400, "Fill the required fields");
  }

  const existUser = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (existUser) {
    throw new ApiError(400, "User already exists");
  }

  // const avatarLocalPath = req.files?.avatar[0]?.path;
  // const coverImageLocalPath = req.files?.coverImage[0]?.path;

  let coverImageLocalPath;

  if (
    req.files &&
    Array.isArray(req.files.coverImage) &&
    req.files.coverImage.length > 0
  ) {
    coverImageLocalPath = req.files.coverImage[0].path;
  }

  let avatarLocalPath;

  if (
    req.files &&
    Array.isArray(req.files.avatar) &&
    req.files.avatar.length > 0
  ) {
    avatarLocalPath = req.files.avatar[0].path;
  }

  if (!avatarLocalPath) {
    throw new ApiError(400, "Upload an avatar");
  }

  const avatar = await cloudinaryUpload(avatarLocalPath);

  let coverImage = {
    url: "",
  };

  if (coverImageLocalPath) {
    coverImage = await cloudinaryUpload(coverImageLocalPath);
  }

  if (!avatar) {
    throw new ApiError(500, "Something went wrong while uploading avatar");
  }

  const user = await User.create({
    username: username.toLowerCase(),
    email,
    password,
    fullname,
    avatar: avatar.url,
    coverImage: coverImage.url || "",
  });

  const createdUser = await User.findById(user._id).select(
    "-password -refreshTokens"
  );

  if (!createdUser) {
    throw new ApiError(500, "Something went wrong while creating user");
  }

  return res
    .status(200)
    .json(new ApiResponse(201, createdUser, "User successfully created"));
});

const loginUser = asyncHandler(async (req, res) => {
  const { username, email, password } = req.body;

  console.log(username+" "+email+" "+password);

  if (!username && !email) {
    throw new ApiError(400, "Enter atleast one of mail or username");
  }

  if (!password) {
    throw new ApiError(400, "Enter password");
  }

  const existUser = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (!existUser) {
    throw new ApiError(400, "No such user exists");
  }

  const userAccess = await existUser.isPasswordCorrect(password);

  if (!userAccess) {
    throw new ApiError(401, "Invalid password");
  }

  const { accessToken, refreshToken } = await generateAccessandRefreshtoken(
    existUser._id
  );

  const loggedInUser = await User.findById(existUser._id).select(
    "-password -refreshTokens"
  );

  const options = {
    httpOnly: true,
    secure: true
  }

  return res
  .status(200)
  .cookie("refreshToken", refreshToken, options)
  .cookie("accessToken", accessToken, options)
  .json(new ApiResponse(200, {user: loggedInUser, refreshToken, accessToken}, "User successfully logged in"));

});

const logoutUser = asyncHandler(async (req, res) => {
    // const { user } = req.user;
    await User.findByIdAndUpdate(req.user._id, {
        $set: {
            refreshToken: undefined
        }
    },{
        new: true
    })

    const options = {
        httpOnly: true,
        secure: true
      }

      return res
      .status(200)
      .clearCookie("accessToken", options)
      .clearCookie("refreshToken", options)
      .json(new ApiResponse(200, {}, "User logged Out"))
  
    
})

const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken;

  if(!incomingRefreshToken){
    throw new ApiError(400, "No refresh token found");
  }

  const decodedToken = await jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET);

  if(!decodedToken){
    throw new ApiError(401, "Invalid refresh token");
  }

  const user = await User.findById(decodedToken._id);

  if(!user){
    throw new ApiError(404, "User not found");
  }

  const userRefreshToken = await user.refreshToken;

  if(decodedToken != userRefreshToken){
    throw new ApiError(401, "Token used or expired");
  }

  const {newAccessToken, newRefreshToken} = await generateAccessandRefreshtoken(user._id);

  const options = {
    httpOnly: true,
    secure: true
  }

  return res
  .status(200)
  .cookie("refreshToken", newRefreshToken, options)
  .cookie("accessToken", newAccessToken, options)
  .json(
      new ApiResponse(200, {refreshToken: newRefreshToken, accessToken: newAccessToken}, "AccessToken refreshed")
  )
})

const changePassword = asyncHandler( async(req, res) => {
  const {oldPass, newPass} = req.body

  const user = User.findById(req.user?._id)

  const isPassTrue = await user.isPasswordCorrect(oldPass)

  if(!isPassTrue){
    throw new ApiError(400, "Incorrect Old Password")
  }

  user.password = newPass
  user.save({validateBeforeSave: false})

  return res
  .status(200)
  .json(new ApiResponse(200, {}, "User Password Changed"))
  
})

const getCurrentUser = asyncHandler( async(req, res) => {
  return res
  .status(200)
  .json(
    new ApiResponse(200, req.user, "User found")
  )
})

const changeAccountDetails = asyncHandler( async(req, res) => {
  const {fullname, email} = req.body

  if(!fullname && !email){
    throw new ApiError(400, "All fields are required")
  }

  const user = User.findByIdAndUpdate(req.user?._id, 
    {
      $set: {
        fullname,
        email
      }
    },
    {
      new: true
    }
  ).select("-password")

return res
.status(200)
.json( new ApiResponse(200, user, "details changed successfully"))

})

const updateAvatar = asyncHandler( async(req, res) => {
  let avatarLocalPath = req.file?.path

  if (!avatarLocalPath) {
    throw new ApiError(400, "Upload an avatar");
  }

  const avatar = await cloudinaryUpload(avatarLocalPath)

  if(!avatar.url){
    throw new ApiError(500, "Cloudinary upload error")
  }

  const user = req.user._id
  user.avatar = avatar.url
  user.save({validateBeforeSave: false})

  return res
  .status(200)
  .json(
    new ApiResponse(200, {}, "Avatar changed successfully")
  )

})

const updateCoverImage = asyncHandler( async(req, res) => {
  let coverImageLocalPath = req.file?.path

  if (!coverImageLocalPath) {
    throw new ApiError(400, "Upload an image");
  }

  const coverImage = await cloudinaryUpload(coverImageLocalPath)

  if(!coverImage.url){
    throw new ApiError(500, "Cloudinary upload error")
  }

  const user = req.user._id
  user.coverImage = coverImage.url
  user.save({validateBeforeSave: false})

  return res
  .status(200)
  .json(
    new ApiResponse(200, {}, "coverImage changed successfully")
  )

})

const getUserChannelProfile = asyncHandler( async(req, res) => {
  const {username} = req.params

  if(!username?.trim()){
    throw new ApiError(400, "Username is missing")
  }

  const channel = await User.aggregate([
    {
      $match: {
        username : username?.toLowerCase()
      }
    },
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "channel",
        as: "subscribers"
      }
    },
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "subscriber",
        as: "subscribedTo"
      }
    },
    {
      $addFields: {
        subscriberCount: {
          $size : "$subscribers"
        },
        channelIsSubscribedToCount: {
          $size: "$subscribedTo"
        },
        isSubscribed: {
          $cond: {
            if: {$in : [req.user?._id, "subscribers.subscriber"]},
            then: true,
            else: false
          }
        }
      }
    },
    {
      $project: {
        fullname: 1,
        username: 1,
        avatar: 1,
        coverImage: 1,
        subcriberCount: 1,
        channelIsSubscribedToCount: 1,
        isSubscribed: 1,
        email: 1
      }
    }
  ])

  if(!channel?.length){
    throw new ApiError(400, "Channel is not present")
  }

  return res
  .status(200)
  . json(new ApiResponse(200, channel[0], "User Profile fetched successfully"))

})

const getWatchHistory = asyncHandler( async(req, res) => {
  
  const history = User.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(req.user._id)
      }
    },
    {
      $lookup: {
        from: "videos",
        localField: "watchHistory",
        foreignField: "_id",
        as: "watchHistory",
        pipeline: [
          {
            $lookup: {
              from: "users",
              localField: "owner",
              foreignField: "_id",
              as: "owner",
              pipeline: [
                {
                  $project: {
                    username: 1,
                    fullname: 1,
                    avatar: 1
                  }
                }
              ]
            }
          },
          {
            $addFields: {
              owner: {
                 $first: "$owner"
              }
            }
          }
        ]
      }
    }
  ])

  return res
  .status(200)
  .json(
      new ApiResponse(
          200,
          history[0].watchHistory,
          "Watch history fetched successfully"
      )
  )

})

export { registerUser, loginUser, logoutUser, refreshAccessToken, changePassword, getCurrentUser, changeAccountDetails, updateAvatar, updateCoverImage, getUserChannelProfile, getWatchHistory };
