if(process.env.NODE_ENV!="production"){
 require("dotenv").config();
}
const express =require("express");
const app=express();
const mongoose=require("mongoose");
const Listing=require("./models/listing.js"); // importing the models from model folder(schema and model)
const path=require("path");
const expressLayouts = require("express-ejs-layouts");
//let mongo_url="mongodb://127.0.0.1:27017/wanderlust"// mongodb connection URL
let dbUrl=process.env.ATLASDB_URL;
const methodOverride=require("method-override");
const wrapAsync=require("./utils/wrapAsync.js");
const ExpressError=require("./utils/ExpressError.js");
const { listingSchema } = require("./schema.js");
const { reviewSchema } = require("./schema.js");
const Review = require("./models/review.js");
const session=require("express-session");
const flash=require("connect-flash");
const passport=require("passport");
const LocalStrategy= require("passport-local");
const user=require("./models/user.js");
// const listings=require("./routes/listing.js");
// const reviews=require("./routes/review.js");
 const userRouter=require("./routes/user.js");
 const {isLoggedIn,isOwner,isReviewAuthor}=require("./middleware.js");
 const multer  = require('multer');
 const { storage } =require("./cloudconfig.js");
const upload = multer({ storage });


// CALLING OF FUNCTION FOR MONGODB CONNECTION
main()
.then(()=>{
    console.log("connected");
})
.catch((err)=>{
    console.log(err);
})
//...............................................................................................//
// FUNCTION FOR THE CONNECTION OF MONGODB
async function main(){
    await mongoose.connect(dbUrl)
}

app.set("view engine","ejs");
app.set("views",path.join(__dirname,"views"));
app.use(express.urlencoded({extended: true}));
app.use(methodOverride("_method"));
app.use(expressLayouts);  // ✅ Use express-ejs-layouts
app.set("layout", "layouts/boilerplate");  // ✅ Set default layout
app.use(express.static(path.join(__dirname,"/public")));
app.use(express.urlencoded({ extended: true }));

 const sessionOptions = {
    secret : "mysuoersecretcode",
    resave:false,
    saveUninitialized:true,
    cookie:{
        expires: Date.now()+7*24*60*60*1000,
        maxAge:7*24*60*60*1000,
        httpOnly:true
    },
 };

 app.use(session(sessionOptions));
 app.use(flash());

app.use(passport.initialize()); // to initialize passport libraries.
app.use(passport.session()); // identify users browse from page to page
passport.use(new LocalStrategy(user.authenticate()))

passport.serializeUser(user.serializeUser());
passport.deserializeUser(user.deserializeUser());

 app.use((req,res,next)=>{
    res.locals.success = req.flash("success");
    res.locals.error=req.flash("error");
    res.locals.currUser = req.user;
    next();
 })

 app.get("/demouser",async(req,res)=>{
    let fakeUser= new user({
        email:"student@gmail.com",
        username:"delta",
    });
    let registered= await user.register(fakeUser,"helloworld");
    res.send(registered);
 });
//..................................................................................................//
 //.........................................................................................................

 let validateListing =(req,res,next)=>{
    let { error } = listingSchema.validate(req.body);
    if(error){
    let errMsg=error.details.map((el)=> el.message).join(",");
     throw new ExpressError(400, errMsg);
    }
    else{
   next();
    }
}

//index route
app.get("/listing",async(req,res)=>{
    let allListing= await Listing.find({});
 res.render("listings/index.ejs",{ allListing });
 })
 //..............................................................................................................

 // NEW ROUTE
 app.get("/listings/new",isLoggedIn,
    (req,res)=>{
    
    res.render("listings/new.ejs");
 })
 //...............................................................................................................
 // show route
 app.get("/listing/:id",wrapAsync(async(req,res)=>{
    let{ id } =req.params;
   const listing= await Listing.findById(id).populate({
    path:"reviews",
    populate:{
        path:"author",
    },
}
)
.populate("owner");
   res.render("listings/show.ejs",{ listing });
 }))
 //..............................................................................................................
// create route
app.post("/listing",isLoggedIn,
    upload.single("listing[image]"),
    validateListing,
    wrapAsync(async(req,res,next)=>{
    let url=req.file.path;
    let filename=req.file.filename;
     const newListing=new Listing(req.body.listing);
     newListing.owner=req.user._id;
     newListing.image={url,filename};
     await newListing.save();
     req.flash("success","New Listing Created!");
     res.redirect("/listing");
})
)

// edit route
app.get("/listing/:id/edit", isLoggedIn,isOwner,wrapAsync(async(req,res)=>{
    let { id }=req.params;
    const listing= await Listing.findById(id);
    let originalImageUrl=listing.image.url;
   originalImageUrl= originalImageUrl.replace("/upload","/upload/w_250")
    res.render("listings/edit.ejs",{ listing,originalImageUrl });
}))

//update route

app.put("/listing/:id", 
isLoggedIn,
isOwner,
upload.single("listing[image]"),
validateListing,
wrapAsync(async(req,res)=>{  
let { id }=req.params;
//let listing = await Listing.findById(id);
// if (!req.body.listing.image || !req.body.listing.image.url || req.body.listing.image.url.trim() === "") {
//     req.body.listing.image = listing.image; // Retain old image if new one is empty
// }
 let listing = await Listing.findByIdAndUpdate(id,{...req.body.listing});
 if( typeof req.file!=="undefined"){
 let url=req.file.path;
 let filename=req.file.filename;
 listing.image={url,filename};
 await listing.save();
 }
 req.flash("success","Listing Successfully Updated");
 res.redirect(`/listing/${id}`);
}))

//DELETE ROUTE
app.delete("/listing/:id",isLoggedIn,isOwner,wrapAsync(async(req,res)=>{
    let{ id }=req.params;
    let deleteListing= await Listing.findByIdAndDelete(id);
   
    res.redirect("/listing");
}));

let validateReview =(req,res,next)=>{
    let { error } = reviewSchema.validate(req.body);
    if(error){
    let errMsg=error.details.map((el)=> el.message).join(",");
     throw new ExpressError(400, errMsg);
    }
    else{
   next();
    }
}

// app.use("/listing",listings);
// app.use("/listing/:id/reviews",reviews);
app.use("/",userRouter);
 
// review 
// post route
app.post("/listing/:id/reviews",isLoggedIn,validateReview,wrapAsync(async(req,res)=>{
let listing = await Listing.findById(req.params.id);
let newReview= new Review(req.body.review);
newReview.author=req.user._id;
listing.reviews.push(newReview);

await newReview.save();
await listing.save();
 res.redirect(`/listing/${listing._id}`);
}))

//DELETE REVIEW ROUTE 

app.delete("/listing/:id/reviews/:reviewId",isLoggedIn,isReviewAuthor,wrapAsync(async(req,res)=>{
    let { id,reviewId }=req.params;
    await Listing.findByIdAndUpdate(id,{ $pull:  {reviews : reviewId }})
    await Review.findByIdAndDelete(reviewId)
    res.redirect(`/listing/${id}`);
    }))

app.all("*",(req,res,next)=>{
    next(new ExpressError(404,"Page Not Found"));
})


app.use((err,req,res,next)=>{
let{statusCode=505,message="Something Went Wrong"}=err;
    // res.status(statusCode).send(message)
    res.render("error.ejs",{ err })
})
app.listen("8080",()=>{
    console.log("app is listening");
})