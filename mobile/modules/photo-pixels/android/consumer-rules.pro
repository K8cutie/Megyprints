# What Google ML Kit needs to start in a RELEASE build (R8 shrinks the app's
# code there; debug builds and Metro don't, which is why the face finder
# worked on the dev test screen and in no release build up to 2.1.0).
#
# ML Kit starts through "registrar" classes it makes by reflection, named in
# the app's manifest (com.google.firebase.components.ComponentDiscovery):
# FaceRegistrar, VisionCommonRegistrar, CommonComponentRegistrar. Nothing in
# the code calls their constructors, so R8 took them out, ML Kit could not
# start, and every face search failed: the log said
#   NoSuchMethodException: com.google.mlkit.vision.face.internal.FaceRegistrar.<init> []
# and MegyPhotoPixels.faces was rejected with a NullPointerException.
# ML Kit's own packages ship no rule for this. Keep every registrar's
# constructor (they are a few small classes).
-keep class * implements com.google.firebase.components.ComponentRegistrar { <init>(); }
